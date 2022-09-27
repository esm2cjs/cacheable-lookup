# @esm2cjs/cacheable-lookup

This is a fork of https://github.com/szmarczak/cacheable-lookup, but automatically patched to support ESM **and** CommonJS, unlike the original repository.

## Install

You can use an npm alias to install this package under the original name:

```
npm i @szmarczak/cacheable-lookup@npm:@esm2cjs/cacheable-lookup
```

```jsonc
// package.json
"dependencies": {
    "@szmarczak/cacheable-lookup": "npm:@esm2cjs/cacheable-lookup"
}
```

but `npm` might dedupe this incorrectly when other packages depend on the replaced package. If you can, prefer using the scoped package directly:

```
npm i @esm2cjs/cacheable-lookup
```

```jsonc
// package.json
"dependencies": {
    "@esm2cjs/cacheable-lookup": "^ver.si.on"
}
```

## Usage

```js
// Using ESM import syntax
import CacheableLookup from "@esm2cjs/cacheable-lookup";

// Using CommonJS require()
const CacheableLookup = require("@esm2cjs/cacheable-lookup").default;
```

> **Note:**
> Because the original module uses `export default`, you need to append `.default` to the `require()` call.

For more details, please see the original [repository](https://github.com/szmarczak/cacheable-lookup).

## Sponsoring

To support my efforts in maintaining the ESM/CommonJS hybrid, please sponsor [here](https://github.com/sponsors/AlCalzone).

To support the original author of the module, please sponsor [here](https://github.com/szmarczak/cacheable-lookup).
