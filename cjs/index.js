var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all2) => {
  for (var name in all2)
    __defProp(target, name, { get: all2[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var esm_exports = {};
__export(esm_exports, {
  default: () => CacheableLookup
});
module.exports = __toCommonJS(esm_exports);
var import_node_dns = require("node:dns");
var import_node_util = require("node:util");
var import_node_os = __toESM(require("node:os"));
const { Resolver: AsyncResolver } = import_node_dns.promises;
const kCacheableLookupCreateConnection = Symbol("cacheableLookupCreateConnection");
const kCacheableLookupInstance = Symbol("cacheableLookupInstance");
const kExpires = Symbol("expires");
const supportsALL = typeof import_node_dns.ALL === "number";
const verifyAgent = (agent) => {
  if (!(agent && typeof agent.createConnection === "function")) {
    throw new Error("Expected an Agent instance as the first argument");
  }
};
const map4to6 = (entries) => {
  for (const entry of entries) {
    if (entry.family === 6) {
      continue;
    }
    entry.address = `::ffff:${entry.address}`;
    entry.family = 6;
  }
};
const getIfaceInfo = () => {
  let has4 = false;
  let has6 = false;
  for (const device of Object.values(import_node_os.default.networkInterfaces())) {
    for (const iface of device) {
      if (iface.internal) {
        continue;
      }
      if (iface.family === "IPv6") {
        has6 = true;
      } else {
        has4 = true;
      }
      if (has4 && has6) {
        return { has4, has6 };
      }
    }
  }
  return { has4, has6 };
};
const isIterable = (map) => {
  return Symbol.iterator in map;
};
const ignoreNoResultErrors = (dnsPromise) => {
  return dnsPromise.catch((error) => {
    if (error.code === "ENODATA" || error.code === "ENOTFOUND" || error.code === "ENOENT") {
      return [];
    }
    throw error;
  });
};
const ttl = { ttl: true };
const all = { all: true };
const all4 = { all: true, family: 4 };
const all6 = { all: true, family: 6 };
class CacheableLookup {
  constructor({
    cache = /* @__PURE__ */ new Map(),
    maxTtl = Infinity,
    fallbackDuration = 3600,
    errorTtl = 0.15,
    resolver = new AsyncResolver(),
    lookup = import_node_dns.lookup
  } = {}) {
    this.maxTtl = maxTtl;
    this.errorTtl = errorTtl;
    this._cache = cache;
    this._resolver = resolver;
    this._dnsLookup = lookup && (0, import_node_util.promisify)(lookup);
    this.stats = {
      cache: 0,
      query: 0
    };
    if (this._resolver instanceof AsyncResolver) {
      this._resolve4 = this._resolver.resolve4.bind(this._resolver);
      this._resolve6 = this._resolver.resolve6.bind(this._resolver);
    } else {
      this._resolve4 = (0, import_node_util.promisify)(this._resolver.resolve4.bind(this._resolver));
      this._resolve6 = (0, import_node_util.promisify)(this._resolver.resolve6.bind(this._resolver));
    }
    this._iface = getIfaceInfo();
    this._pending = {};
    this._nextRemovalTime = false;
    this._hostnamesToFallback = /* @__PURE__ */ new Set();
    this.fallbackDuration = fallbackDuration;
    if (fallbackDuration > 0) {
      const interval = setInterval(() => {
        this._hostnamesToFallback.clear();
      }, fallbackDuration * 1e3);
      if (interval.unref) {
        interval.unref();
      }
      this._fallbackInterval = interval;
    }
    this.lookup = this.lookup.bind(this);
    this.lookupAsync = this.lookupAsync.bind(this);
  }
  set servers(servers) {
    this.clear();
    this._resolver.setServers(servers);
  }
  get servers() {
    return this._resolver.getServers();
  }
  lookup(hostname, options, callback) {
    if (typeof options === "function") {
      callback = options;
      options = {};
    } else if (typeof options === "number") {
      options = {
        family: options
      };
    }
    if (!callback) {
      throw new Error("Callback must be a function.");
    }
    this.lookupAsync(hostname, options).then((result) => {
      if (options.all) {
        callback(null, result);
      } else {
        callback(null, result.address, result.family, result.expires, result.ttl, result.source);
      }
    }, callback);
  }
  async lookupAsync(hostname, options = {}) {
    if (typeof options === "number") {
      options = {
        family: options
      };
    }
    let cached = await this.query(hostname);
    if (options.family === 6) {
      const filtered = cached.filter((entry) => entry.family === 6);
      if (options.hints & import_node_dns.V4MAPPED) {
        if (supportsALL && options.hints & import_node_dns.ALL || filtered.length === 0) {
          map4to6(cached);
        } else {
          cached = filtered;
        }
      } else {
        cached = filtered;
      }
    } else if (options.family === 4) {
      cached = cached.filter((entry) => entry.family === 4);
    }
    if (options.hints & import_node_dns.ADDRCONFIG) {
      const { _iface } = this;
      cached = cached.filter((entry) => entry.family === 6 ? _iface.has6 : _iface.has4);
    }
    if (cached.length === 0) {
      const error = new Error(`cacheableLookup ENOTFOUND ${hostname}`);
      error.code = "ENOTFOUND";
      error.hostname = hostname;
      throw error;
    }
    if (options.all) {
      return cached;
    }
    return cached[0];
  }
  async query(hostname) {
    let source = "cache";
    let cached = await this._cache.get(hostname);
    if (cached) {
      this.stats.cache++;
    }
    if (!cached) {
      const pending = this._pending[hostname];
      if (pending) {
        this.stats.cache++;
        cached = await pending;
      } else {
        source = "query";
        const newPromise = this.queryAndCache(hostname);
        this._pending[hostname] = newPromise;
        this.stats.query++;
        try {
          cached = await newPromise;
        } finally {
          delete this._pending[hostname];
        }
      }
    }
    cached = cached.map((entry) => {
      return { ...entry, source };
    });
    return cached;
  }
  async _resolve(hostname) {
    const [A, AAAA] = await Promise.all([
      ignoreNoResultErrors(this._resolve4(hostname, ttl)),
      ignoreNoResultErrors(this._resolve6(hostname, ttl))
    ]);
    let aTtl = 0;
    let aaaaTtl = 0;
    let cacheTtl = 0;
    const now = Date.now();
    for (const entry of A) {
      entry.family = 4;
      entry.expires = now + entry.ttl * 1e3;
      aTtl = Math.max(aTtl, entry.ttl);
    }
    for (const entry of AAAA) {
      entry.family = 6;
      entry.expires = now + entry.ttl * 1e3;
      aaaaTtl = Math.max(aaaaTtl, entry.ttl);
    }
    if (A.length > 0) {
      if (AAAA.length > 0) {
        cacheTtl = Math.min(aTtl, aaaaTtl);
      } else {
        cacheTtl = aTtl;
      }
    } else {
      cacheTtl = aaaaTtl;
    }
    return {
      entries: [
        ...A,
        ...AAAA
      ],
      cacheTtl
    };
  }
  async _lookup(hostname) {
    try {
      const [A, AAAA] = await Promise.all([
        ignoreNoResultErrors(this._dnsLookup(hostname, all4)),
        ignoreNoResultErrors(this._dnsLookup(hostname, all6))
      ]);
      return {
        entries: [
          ...A,
          ...AAAA
        ],
        cacheTtl: 0
      };
    } catch {
      return {
        entries: [],
        cacheTtl: 0
      };
    }
  }
  async _set(hostname, data, cacheTtl) {
    if (this.maxTtl > 0 && cacheTtl > 0) {
      cacheTtl = Math.min(cacheTtl, this.maxTtl) * 1e3;
      data[kExpires] = Date.now() + cacheTtl;
      try {
        await this._cache.set(hostname, data, cacheTtl);
      } catch (error) {
        this.lookupAsync = async () => {
          const cacheError = new Error("Cache Error. Please recreate the CacheableLookup instance.");
          cacheError.cause = error;
          throw cacheError;
        };
      }
      if (isIterable(this._cache)) {
        this._tick(cacheTtl);
      }
    }
  }
  async queryAndCache(hostname) {
    if (this._hostnamesToFallback.has(hostname)) {
      return this._dnsLookup(hostname, all);
    }
    let query = await this._resolve(hostname);
    if (query.entries.length === 0 && this._dnsLookup) {
      query = await this._lookup(hostname);
      if (query.entries.length !== 0 && this.fallbackDuration > 0) {
        this._hostnamesToFallback.add(hostname);
      }
    }
    const cacheTtl = query.entries.length === 0 ? this.errorTtl : query.cacheTtl;
    await this._set(hostname, query.entries, cacheTtl);
    return query.entries;
  }
  _tick(ms) {
    const nextRemovalTime = this._nextRemovalTime;
    if (!nextRemovalTime || ms < nextRemovalTime) {
      clearTimeout(this._removalTimeout);
      this._nextRemovalTime = ms;
      this._removalTimeout = setTimeout(() => {
        this._nextRemovalTime = false;
        let nextExpiry = Infinity;
        const now = Date.now();
        for (const [hostname, entries] of this._cache) {
          const expires = entries[kExpires];
          if (now >= expires) {
            this._cache.delete(hostname);
          } else if (expires < nextExpiry) {
            nextExpiry = expires;
          }
        }
        if (nextExpiry !== Infinity) {
          this._tick(nextExpiry - now);
        }
      }, ms);
      if (this._removalTimeout.unref) {
        this._removalTimeout.unref();
      }
    }
  }
  install(agent) {
    verifyAgent(agent);
    if (kCacheableLookupCreateConnection in agent) {
      throw new Error("CacheableLookup has been already installed");
    }
    agent[kCacheableLookupCreateConnection] = agent.createConnection;
    agent[kCacheableLookupInstance] = this;
    agent.createConnection = (options, callback) => {
      if (!("lookup" in options)) {
        options.lookup = this.lookup;
      }
      return agent[kCacheableLookupCreateConnection](options, callback);
    };
  }
  uninstall(agent) {
    verifyAgent(agent);
    if (agent[kCacheableLookupCreateConnection]) {
      if (agent[kCacheableLookupInstance] !== this) {
        throw new Error("The agent is not owned by this CacheableLookup instance");
      }
      agent.createConnection = agent[kCacheableLookupCreateConnection];
      delete agent[kCacheableLookupCreateConnection];
      delete agent[kCacheableLookupInstance];
    }
  }
  updateInterfaceInfo() {
    const { _iface } = this;
    this._iface = getIfaceInfo();
    if (_iface.has4 && !this._iface.has4 || _iface.has6 && !this._iface.has6) {
      this._cache.clear();
    }
  }
  clear(hostname) {
    if (hostname) {
      this._cache.delete(hostname);
      return;
    }
    this._cache.clear();
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {});
//# sourceMappingURL=index.js.map
