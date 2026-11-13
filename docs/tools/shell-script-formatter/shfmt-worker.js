(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
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
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // ../../../../toolchk5-work/sfb.L3Tn/p/sh-syntax/vendors/wasm_exec.cjs
  var require_wasm_exec = __commonJS({
    "../../../../toolchk5-work/sfb.L3Tn/p/sh-syntax/vendors/wasm_exec.cjs"() {
      "use strict";
      (() => {
        const enosys = () => {
          const err = new Error("not implemented");
          err.code = "ENOSYS";
          return err;
        };
        if (!globalThis.fs) {
          let outputBuf = "";
          globalThis.fs = {
            constants: { O_WRONLY: -1, O_RDWR: -1, O_CREAT: -1, O_TRUNC: -1, O_APPEND: -1, O_EXCL: -1, O_DIRECTORY: -1 },
            // unused
            writeSync(fd, buf) {
              outputBuf += decoder2.decode(buf);
              const nl = outputBuf.lastIndexOf("\n");
              if (nl != -1) {
                console.log(outputBuf.substring(0, nl));
                outputBuf = outputBuf.substring(nl + 1);
              }
              return buf.length;
            },
            write(fd, buf, offset, length, position, callback) {
              if (offset !== 0 || length !== buf.length || position !== null) {
                callback(enosys());
                return;
              }
              const n = this.writeSync(fd, buf);
              callback(null, n);
            },
            chmod(path, mode, callback) {
              callback(enosys());
            },
            chown(path, uid, gid, callback) {
              callback(enosys());
            },
            close(fd, callback) {
              callback(enosys());
            },
            fchmod(fd, mode, callback) {
              callback(enosys());
            },
            fchown(fd, uid, gid, callback) {
              callback(enosys());
            },
            fstat(fd, callback) {
              callback(enosys());
            },
            fsync(fd, callback) {
              callback(null);
            },
            ftruncate(fd, length, callback) {
              callback(enosys());
            },
            lchown(path, uid, gid, callback) {
              callback(enosys());
            },
            link(path, link, callback) {
              callback(enosys());
            },
            lstat(path, callback) {
              callback(enosys());
            },
            mkdir(path, perm, callback) {
              callback(enosys());
            },
            open(path, flags, mode, callback) {
              callback(enosys());
            },
            read(fd, buffer, offset, length, position, callback) {
              callback(enosys());
            },
            readdir(path, callback) {
              callback(enosys());
            },
            readlink(path, callback) {
              callback(enosys());
            },
            rename(from, to, callback) {
              callback(enosys());
            },
            rmdir(path, callback) {
              callback(enosys());
            },
            stat(path, callback) {
              callback(enosys());
            },
            symlink(path, link, callback) {
              callback(enosys());
            },
            truncate(path, length, callback) {
              callback(enosys());
            },
            unlink(path, callback) {
              callback(enosys());
            },
            utimes(path, atime, mtime, callback) {
              callback(enosys());
            }
          };
        }
        if (!globalThis.process) {
          globalThis.process = {
            getuid() {
              return -1;
            },
            getgid() {
              return -1;
            },
            geteuid() {
              return -1;
            },
            getegid() {
              return -1;
            },
            getgroups() {
              throw enosys();
            },
            pid: -1,
            ppid: -1,
            umask() {
              throw enosys();
            },
            cwd() {
              throw enosys();
            },
            chdir() {
              throw enosys();
            }
          };
        }
        if (!globalThis.crypto) {
          throw new Error("globalThis.crypto is not available, polyfill required (crypto.getRandomValues only)");
        }
        if (!globalThis.performance) {
          throw new Error("globalThis.performance is not available, polyfill required (performance.now only)");
        }
        if (!globalThis.TextEncoder) {
          throw new Error("globalThis.TextEncoder is not available, polyfill required");
        }
        if (!globalThis.TextDecoder) {
          throw new Error("globalThis.TextDecoder is not available, polyfill required");
        }
        const encoder2 = new TextEncoder("utf-8");
        const decoder2 = new TextDecoder("utf-8");
        let reinterpretBuf = new DataView(new ArrayBuffer(8));
        var logLine = [];
        const wasmExit = {};
        globalThis.Go = class {
          constructor() {
            this._callbackTimeouts = /* @__PURE__ */ new Map();
            this._nextCallbackTimeoutID = 1;
            const mem = () => {
              return new DataView(this._inst.exports.memory.buffer);
            };
            const unboxValue = (v_ref) => {
              reinterpretBuf.setBigInt64(0, v_ref, true);
              const f = reinterpretBuf.getFloat64(0, true);
              if (f === 0) {
                return void 0;
              }
              if (!isNaN(f)) {
                return f;
              }
              const id = v_ref & 0xffffffffn;
              return this._values[id];
            };
            const loadValue = (addr) => {
              let v_ref = mem().getBigUint64(addr, true);
              return unboxValue(v_ref);
            };
            const boxValue = (v) => {
              const nanHead = 0x7FF80000n;
              if (typeof v === "number") {
                if (isNaN(v)) {
                  return nanHead << 32n;
                }
                if (v === 0) {
                  return nanHead << 32n | 1n;
                }
                reinterpretBuf.setFloat64(0, v, true);
                return reinterpretBuf.getBigInt64(0, true);
              }
              switch (v) {
                case void 0:
                  return 0n;
                case null:
                  return nanHead << 32n | 2n;
                case true:
                  return nanHead << 32n | 3n;
                case false:
                  return nanHead << 32n | 4n;
              }
              let id = this._ids.get(v);
              if (id === void 0) {
                id = this._idPool.pop();
                if (id === void 0) {
                  id = BigInt(this._values.length);
                }
                this._values[id] = v;
                this._goRefCounts[id] = 0;
                this._ids.set(v, id);
              }
              this._goRefCounts[id]++;
              let typeFlag = 1n;
              switch (typeof v) {
                case "string":
                  typeFlag = 2n;
                  break;
                case "symbol":
                  typeFlag = 3n;
                  break;
                case "function":
                  typeFlag = 4n;
                  break;
              }
              return id | (nanHead | typeFlag) << 32n;
            };
            const storeValue = (addr, v) => {
              let v_ref = boxValue(v);
              mem().setBigUint64(addr, v_ref, true);
            };
            const loadSlice = (array, len, cap) => {
              return new Uint8Array(this._inst.exports.memory.buffer, array, len);
            };
            const loadSliceOfValues = (array, len, cap) => {
              const a = new Array(len);
              for (let i = 0; i < len; i++) {
                a[i] = loadValue(array + i * 8);
              }
              return a;
            };
            const loadString = (ptr, len) => {
              return decoder2.decode(new DataView(this._inst.exports.memory.buffer, ptr, len));
            };
            const timeOrigin = Date.now() - performance.now();
            const wasi_EBADF = 8;
            const wasi_ENOSYS = 52;
            this.importObject = {
              wasi_snapshot_preview1: {
                // https://github.com/WebAssembly/WASI/blob/snapshot-01/phases/snapshot/docs.md
                fd_write: function(fd, iovs_ptr, iovs_len, nwritten_ptr) {
                  iovs_ptr >>>= 0;
                  iovs_len >>>= 0;
                  nwritten_ptr >>>= 0;
                  let nwritten = 0;
                  if (fd == 1) {
                    for (let iovs_i = 0; iovs_i < iovs_len; iovs_i++) {
                      let iov_ptr = iovs_ptr + iovs_i * 8;
                      let ptr = mem().getUint32(iov_ptr + 0, true);
                      let len = mem().getUint32(iov_ptr + 4, true);
                      nwritten += len;
                      for (let i = 0; i < len; i++) {
                        let c = mem().getUint8(ptr + i);
                        if (c == 13) {
                        } else if (c == 10) {
                          let line = decoder2.decode(new Uint8Array(logLine));
                          logLine = [];
                          console.log(line);
                        } else {
                          logLine.push(c);
                        }
                      }
                    }
                  } else {
                    console.error("invalid file descriptor:", fd);
                  }
                  mem().setUint32(nwritten_ptr, nwritten, true);
                  return 0;
                },
                fd_read: () => wasi_ENOSYS,
                fd_close: () => wasi_ENOSYS,
                fd_fdstat_get: () => wasi_ENOSYS,
                fd_prestat_get: () => wasi_EBADF,
                // wasi-libc relies on this errno value
                fd_prestat_dir_name: () => wasi_ENOSYS,
                fd_seek: () => wasi_ENOSYS,
                path_open: () => wasi_ENOSYS,
                proc_exit: (code) => {
                  this.exited = true;
                  this.exitCode = code;
                  this._resolveExitPromise();
                  throw wasmExit;
                },
                random_get: (bufPtr, bufLen) => {
                  bufPtr >>>= 0;
                  bufLen >>>= 0;
                  crypto.getRandomValues(loadSlice(bufPtr, bufLen));
                  return 0;
                }
              },
              gojs: {
                // func ticks() int64
                "runtime.ticks": () => {
                  return BigInt((timeOrigin + performance.now()) * 1e6);
                },
                // func getRandomData(r []byte)
                "runtime.getRandomData": (slice_ptr, slice_len, slice_cap) => {
                  slice_ptr >>>= 0;
                  slice_len >>>= 0;
                  crypto.getRandomValues(loadSlice(slice_ptr, slice_len, slice_cap));
                },
                // func sleepTicks(timeout int64)
                "runtime.sleepTicks": (timeout) => {
                  const ms = Math.ceil(Number(timeout) / 1e6);
                  const due = Date.now() + ms;
                  if (this._scheduledWakeup !== void 0) {
                    if (this._scheduledWakeupDue <= due) return;
                    clearTimeout(this._scheduledWakeup);
                  }
                  this._scheduledWakeupDue = due;
                  this._scheduledWakeup = setTimeout(() => {
                    this._scheduledWakeup = void 0;
                    if (this.exited) return;
                    try {
                      this._inst.exports.go_scheduler();
                    } catch (e) {
                      if (e !== wasmExit) throw e;
                    }
                  }, ms);
                },
                // func finalizeRef(v ref)
                "syscall/js.finalizeRef": (v_ref) => {
                  const id = v_ref & 0xffffffffn;
                  if (this._goRefCounts?.[id] !== void 0) {
                    this._goRefCounts[id]--;
                    if (this._goRefCounts[id] === 0) {
                      const v = this._values[id];
                      this._values[id] = null;
                      this._ids.delete(v);
                      this._idPool.push(id);
                    }
                  } else {
                    console.error("syscall/js.finalizeRef: unknown id", id);
                  }
                },
                // func stringVal(value string) ref
                "syscall/js.stringVal": (value_ptr, value_len) => {
                  value_ptr >>>= 0;
                  value_len >>>= 0;
                  const s = loadString(value_ptr, value_len);
                  return boxValue(s);
                },
                // func valueGet(v ref, p string) ref
                "syscall/js.valueGet": (v_ref, p_ptr, p_len) => {
                  p_ptr >>>= 0;
                  p_len >>>= 0;
                  let prop = loadString(p_ptr, p_len);
                  let v = unboxValue(v_ref);
                  let result = Reflect.get(v, prop);
                  return boxValue(result);
                },
                // func valueSet(v ref, p string, x ref)
                "syscall/js.valueSet": (v_ref, p_ptr, p_len, x_ref) => {
                  p_ptr >>>= 0;
                  p_len >>>= 0;
                  const v = unboxValue(v_ref);
                  const p = loadString(p_ptr, p_len);
                  const x = unboxValue(x_ref);
                  Reflect.set(v, p, x);
                },
                // func valueDelete(v ref, p string)
                "syscall/js.valueDelete": (v_ref, p_ptr, p_len) => {
                  p_ptr >>>= 0;
                  p_len >>>= 0;
                  const v = unboxValue(v_ref);
                  const p = loadString(p_ptr, p_len);
                  Reflect.deleteProperty(v, p);
                },
                // func valueIndex(v ref, i int) ref
                "syscall/js.valueIndex": (v_ref, i) => {
                  return boxValue(Reflect.get(unboxValue(v_ref), i));
                },
                // valueSetIndex(v ref, i int, x ref)
                "syscall/js.valueSetIndex": (v_ref, i, x_ref) => {
                  Reflect.set(unboxValue(v_ref), i, unboxValue(x_ref));
                },
                // func valueCall(v ref, m string, args []ref) (ref, bool)
                "syscall/js.valueCall": (ret_addr, v_ref, m_ptr, m_len, args_ptr, args_len, args_cap) => {
                  ret_addr >>>= 0;
                  m_ptr >>>= 0;
                  m_len >>>= 0;
                  args_ptr >>>= 0;
                  args_len >>>= 0;
                  const v = unboxValue(v_ref);
                  const name = loadString(m_ptr, m_len);
                  const args = loadSliceOfValues(args_ptr, args_len, args_cap);
                  try {
                    const m = Reflect.get(v, name);
                    storeValue(ret_addr, Reflect.apply(m, v, args));
                    mem().setUint8(ret_addr + 8, 1);
                  } catch (err) {
                    storeValue(ret_addr, err);
                    mem().setUint8(ret_addr + 8, 0);
                  }
                },
                // func valueInvoke(v ref, args []ref) (ref, bool)
                "syscall/js.valueInvoke": (ret_addr, v_ref, args_ptr, args_len, args_cap) => {
                  ret_addr >>>= 0;
                  args_ptr >>>= 0;
                  args_len >>>= 0;
                  try {
                    const v = unboxValue(v_ref);
                    const args = loadSliceOfValues(args_ptr, args_len, args_cap);
                    storeValue(ret_addr, Reflect.apply(v, void 0, args));
                    mem().setUint8(ret_addr + 8, 1);
                  } catch (err) {
                    storeValue(ret_addr, err);
                    mem().setUint8(ret_addr + 8, 0);
                  }
                },
                // func valueNew(v ref, args []ref) (ref, bool)
                "syscall/js.valueNew": (ret_addr, v_ref, args_ptr, args_len, args_cap) => {
                  ret_addr >>>= 0;
                  args_ptr >>>= 0;
                  args_len >>>= 0;
                  const v = unboxValue(v_ref);
                  const args = loadSliceOfValues(args_ptr, args_len, args_cap);
                  try {
                    storeValue(ret_addr, Reflect.construct(v, args));
                    mem().setUint8(ret_addr + 8, 1);
                  } catch (err) {
                    storeValue(ret_addr, err);
                    mem().setUint8(ret_addr + 8, 0);
                  }
                },
                // func valueLength(v ref) int
                "syscall/js.valueLength": (v_ref) => {
                  return unboxValue(v_ref).length;
                },
                // valuePrepareString(v ref) (ref, int)
                "syscall/js.valuePrepareString": (ret_addr, v_ref) => {
                  ret_addr >>>= 0;
                  const s = String(unboxValue(v_ref));
                  const str = encoder2.encode(s);
                  storeValue(ret_addr, str);
                  mem().setInt32(ret_addr + 8, str.length, true);
                },
                // valueLoadString(v ref, b []byte)
                "syscall/js.valueLoadString": (v_ref, slice_ptr, slice_len, slice_cap) => {
                  slice_ptr >>>= 0;
                  slice_len >>>= 0;
                  const str = unboxValue(v_ref);
                  loadSlice(slice_ptr, slice_len, slice_cap).set(str);
                },
                // func valueInstanceOf(v ref, t ref) bool
                "syscall/js.valueInstanceOf": (v_ref, t_ref) => {
                  return unboxValue(v_ref) instanceof unboxValue(t_ref);
                },
                // func copyBytesToGo(dst []byte, src ref) (int, bool)
                "syscall/js.copyBytesToGo": (ret_addr, dest_addr, dest_len, dest_cap, src_ref) => {
                  ret_addr >>>= 0;
                  dest_addr >>>= 0;
                  dest_len >>>= 0;
                  let num_bytes_copied_addr = ret_addr;
                  let returned_status_addr = ret_addr + 4;
                  const dst = loadSlice(dest_addr, dest_len);
                  const src = unboxValue(src_ref);
                  if (!(src instanceof Uint8Array || src instanceof Uint8ClampedArray)) {
                    mem().setUint8(returned_status_addr, 0);
                    return;
                  }
                  const toCopy = src.subarray(0, dst.length);
                  dst.set(toCopy);
                  mem().setUint32(num_bytes_copied_addr, toCopy.length, true);
                  mem().setUint8(returned_status_addr, 1);
                },
                // copyBytesToJS(dst ref, src []byte) (int, bool)
                // Originally copied from upstream Go project, then modified:
                //   https://github.com/golang/go/blob/3f995c3f3b43033013013e6c7ccc93a9b1411ca9/misc/wasm/wasm_exec.js#L404-L416
                "syscall/js.copyBytesToJS": (ret_addr, dst_ref, src_addr, src_len, src_cap) => {
                  ret_addr >>>= 0;
                  src_addr >>>= 0;
                  src_len >>>= 0;
                  let num_bytes_copied_addr = ret_addr;
                  let returned_status_addr = ret_addr + 4;
                  const dst = unboxValue(dst_ref);
                  const src = loadSlice(src_addr, src_len);
                  if (!(dst instanceof Uint8Array || dst instanceof Uint8ClampedArray)) {
                    mem().setUint8(returned_status_addr, 0);
                    return;
                  }
                  const toCopy = src.subarray(0, dst.length);
                  dst.set(toCopy);
                  mem().setUint32(num_bytes_copied_addr, toCopy.length, true);
                  mem().setUint8(returned_status_addr, 1);
                }
              }
            };
            this.importObject.env = this.importObject.gojs;
          }
          async run(instance) {
            this._inst = instance;
            this._values = [
              // JS values that Go currently has references to, indexed by reference id
              NaN,
              0,
              null,
              true,
              false,
              globalThis,
              this
            ];
            this._goRefCounts = [];
            this._ids = /* @__PURE__ */ new Map();
            this._idPool = [];
            this.exited = false;
            if (this._scheduledWakeup !== void 0) {
              clearTimeout(this._scheduledWakeup);
              this._scheduledWakeup = void 0;
            }
            this.exitCode = 0;
            this._pendingEvent = null;
            if (this._inst.exports._start) {
              let exitPromise = new Promise((resolve, reject) => {
                this._resolveExitPromise = resolve;
              });
              try {
                this._inst.exports._start();
              } catch (e) {
                if (e !== wasmExit) throw e;
              }
              await exitPromise;
              return this.exitCode;
            } else {
              this._inst.exports._initialize();
            }
          }
          _resume() {
            if (this.exited) {
              throw new Error("Go program has already exited");
            }
            try {
              this._inst.exports.resume();
            } catch (e) {
              if (e !== wasmExit) throw e;
            }
            if (this.exited) {
              this._resolveExitPromise();
            }
          }
          _makeFuncWrapper(id) {
            const go = this;
            return function() {
              const event = { id, this: this, args: arguments };
              go._pendingEvent = event;
              go._resume();
              return event.result;
            };
          }
        };
      })();
    }
  });

  // ../../../../toolchk5-work/sfb.L3Tn/p/src/verify.js
  var require_verify = __commonJS({
    "../../../../toolchk5-work/sfb.L3Tn/p/src/verify.js"(exports, module) {
      "use strict";
      var DASH_HDOC = 72;
      var DROP = /* @__PURE__ */ new Set(["start", "end", "backquotes"]);
      function isPos(v) {
        return v && typeof v === "object" && !Array.isArray(v) && "offset" in v && "line" in v && "column" in v && !("type" in v);
      }
      function stripTabs(node) {
        if (Array.isArray(node)) return node.map(stripTabs);
        if (!node || typeof node !== "object") return node;
        const out = {};
        for (const k of Object.keys(node)) {
          const v = node[k];
          if (k === "value" && node.type === "Lit" && typeof v === "string") out[k] = v.replace(/(^|\n)\t+/g, "$1");
          else out[k] = stripTabs(v);
        }
        return out;
      }
      function normalizeAst2(file) {
        const comments = [];
        const walk = (node) => {
          if (Array.isArray(node)) {
            const arr = [];
            for (const x of node) {
              if (x && typeof x === "object" && x.type === "Comment") {
                comments.push(String(x.text || "").replace(/\s+$/, ""));
                continue;
              }
              arr.push(walk(x));
            }
            return arr;
          }
          if (!node || typeof node !== "object") return node;
          if (node.type === "Comment") {
            comments.push(String(node.text || "").replace(/\s+$/, ""));
            return null;
          }
          const out = {};
          for (const k of Object.keys(node).sort()) {
            const v = node[k];
            if (DROP.has(k) || isPos(v)) continue;
            if (k === "braces" && node.type === "ForClause") continue;
            if (k === "name" && node.type === "File") continue;
            if (k === "hdoc" && node.type === "Redirect" && node.op === DASH_HDOC) {
              out[k] = walk(stripTabs(v));
              continue;
            }
            out[k] = walk(v);
          }
          return out;
        };
        const tree = walk(file);
        comments.sort();
        return JSON.stringify({ tree, comments });
      }
      module.exports = { normalizeAst: normalizeAst2, isPos };
    }
  });

  // ../../../../toolchk5-work/sfb.L3Tn/wentry.js
  var import_wasm_exec = __toESM(require_wasm_exec());

  // ../../../../toolchk5-work/sfb.L3Tn/p/sh-syntax/lib/types.js
  var LangVariant = {
    /**
     * LangBash corresponds to the GNU Bash language, as described in its manual at
     * https://www.gnu.org/software/bash/manual/bash.html.
     *
     * We currently follow Bash version 5.2.
     *
     * Its string representation is "bash".
     *
     * Note: as of mvdan/sh v3.13, {@link LangVariant} values are bit flags (`1 << iota`) rather than
     * a sequential enum, so every value changed from the previous release.
     */
    LangBash: 1,
    /**
     * LangPOSIX corresponds to the POSIX Shell language, as described at
     * https://pubs.opengroup.org/onlinepubs/9699919799/utilities/V3_chap02.html.
     *
     * Its string representation is "posix" or "sh".
     */
    LangPOSIX: 1 << 1,
    /**
     * LangMirBSDKorn corresponds to the MirBSD Korn Shell, also known as mksh, as described at
     * https://www.mirbsd.org/htman/i386/man1/mksh.htm. Note that it shares some features with Bash,
     * due to the shared ancestry that is ksh.
     *
     * We currently follow mksh version 59.
     *
     * Its string representation is "mksh".
     */
    LangMirBSDKorn: 1 << 2,
    /**
     * LangBats corresponds to the Bash Automated Testing System language, as described at
     * https://github.com/bats-core/bats-core. Note that it's just a small extension of the Bash
     * language.
     *
     * Its string representation is "bats".
     */
    LangBats: 1 << 3,
    /**
     * LangZsh corresponds to the Z shell, as described at https://www.zsh.org/.
     *
     * Note that its support in mvdan/sh is experimental and incomplete for now; see
     * https://github.com/mvdan/sh/issues/120. We currently follow Zsh version 5.9. Added in mvdan/sh
     * v3.13.0.
     *
     * Its string representation is "zsh".
     */
    LangZsh: 1 << 4,
    /**
     * LangAuto corresponds to automatic language detection, commonly used by end-user applications
     * like shfmt, which can guess a file's language variant given its filename or shebang.
     *
     * At this time, [Variant] does not support LangAuto.
     */
    LangAuto: 1 << 5
  };

  // ../../../../toolchk5-work/sfb.L3Tn/p/sh-syntax/lib/processor.js
  var ParseError = class extends Error {
    constructor({ filename, incomplete, text, pos }) {
      super(text);
      this.filename = filename;
      this.incomplete = incomplete;
      this.text = text;
      this.pos = pos;
    }
  };
  var supportedVariants = /* @__PURE__ */ new Set([
    LangVariant.LangBash,
    LangVariant.LangPOSIX,
    LangVariant.LangMirBSDKorn,
    LangVariant.LangBats,
    LangVariant.LangZsh
  ]);
  var encoder;
  var decoder;
  var invoke = ({ memory, wasmAlloc, wasmFree, process }, textOrAst, { filepath = "", print = false, originalText, keepComments = true, variant = LangVariant.LangBash, stopAt = "", recoverErrors = 0, useTabs = false, tabWidth = 2, simplify = false, indent = useTabs ? 0 : tabWidth, binaryNextLine = true, switchCaseIndent = true, spaceRedirects = true, keepPadding = false, minify = false, singleLine = false, functionNextLine = false } = {}) => {
    encoder ??= new TextEncoder();
    decoder ??= new TextDecoder();
    if (!supportedVariants.has(variant)) {
      throw new TypeError(`Unsupported shell variant: ${variant}`);
    }
    let text;
    let printOutput;
    if (typeof textOrAst === "string") {
      text = textOrAst;
      printOutput = print;
    } else {
      if (originalText == null) {
        throw new TypeError("processor(ast) is not supported; pass { originalText } to format the source text");
      }
      text = originalText;
      printOutput = true;
    }
    const filePath = encoder.encode(filepath);
    const textBytes = encoder.encode(text);
    const stopAtBytes = encoder.encode(stopAt);
    const filePathPointer = wasmAlloc(filePath.byteLength);
    new Uint8Array(memory.buffer).set(filePath, filePathPointer);
    const textPointer = wasmAlloc(textBytes.byteLength);
    new Uint8Array(memory.buffer).set(textBytes, textPointer);
    const stopAtPointer = wasmAlloc(stopAtBytes.byteLength);
    new Uint8Array(memory.buffer).set(stopAtBytes, stopAtPointer);
    const resultPointer = process(filePathPointer, filePath.byteLength, filePath.byteLength, textPointer, textBytes.byteLength, textBytes.byteLength, printOutput, keepComments, variant, stopAtPointer, stopAtBytes.byteLength, stopAtBytes.byteLength, recoverErrors, simplify, indent, binaryNextLine, switchCaseIndent, spaceRedirects, keepPadding, minify, singleLine, functionNextLine);
    wasmFree(filePathPointer);
    wasmFree(textPointer);
    wasmFree(stopAtPointer);
    const result = new Uint8Array(memory.buffer).subarray(resultPointer);
    const end = result.indexOf(0);
    const string = decoder.decode(result.subarray(0, end));
    /* istanbul ignore if -- @preserve */
    if (!string.startsWith('{"') || !string.endsWith("}")) {
      throw new ParseError({
        filename: filepath,
        incomplete: true,
        text: string
      });
    }
    const { file, text: processedText, parseError, message } = JSON.parse(string);
    if (parseError) {
      throw new ParseError(parseError);
    }
    if (message) {
      throw new SyntaxError(message);
    }
    return printOutput ? processedText : file;
  };
  var getProcessorSync = (getWasm) => {
    const module = new WebAssembly.Module(typeof getWasm === "function" ? getWasm() : getWasm);
    function processor2(textOrAst, options) {
      const go = new Go();
      const instance = new WebAssembly.Instance(module, go.importObject);
      void go.run(instance);
      return invoke(instance.exports, textOrAst, options);
    }
    return processor2;
  };

  // ../../../../toolchk5-work/sfb.L3Tn/wentry.js
  var { normalizeAst } = require_verify();
  importScripts("shfmt-wasm.js");
  var proc = null;
  function processor() {
    if (!proc) {
      const bin = atob(self.ZOVO_SHFMT_WASM), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      proc = getProcessorSync(u8);
    }
    return proc;
  }
  function errorOut(e) {
    if (e && (e.name === "ParseError" || "incomplete" in e) && e.pos) {
      return { ok: false, kind: "syntax", message: String(e.text || e.message || "syntax error"), line: e.pos.line, column: e.pos.column, offset: e.pos.offset, incomplete: !!e.incomplete };
    }
    if (e && (e.name === "ParseError" || e.name === "SyntaxError")) {
      const text = String(e.text || e.message || "syntax error");
      const m = /^(?:[^:]*:)?(\d+):(\d+): (.*)$/s.exec(text);
      if (m) return { ok: false, kind: "syntax", message: m[3], line: +m[1], column: +m[2], incomplete: !!e.incomplete };
      return { ok: false, kind: "syntax", message: text, line: 0, column: 0, incomplete: !!e.incomplete };
    }
    const raw = String(e && e.message || e);
    if (e && e.name === "RuntimeError" || /memory access out of bounds|call stack|stack overflow|unreachable|out of memory/i.test(raw)) {
      proc = null;
      return { ok: false, kind: "engine", message: "This script is nested too deeply for the built-in shfmt engine, so it was left unchanged.", detail: raw };
    }
    return { ok: false, kind: "engine", message: raw };
  }
  function run(msg) {
    const t0 = Date.now();
    const p = processor();
    const opts = Object.assign({
      variant: 1,
      indent: 0,
      binaryNextLine: false,
      switchCaseIndent: false,
      spaceRedirects: false,
      keepPadding: false,
      functionNextLine: false,
      simplify: false,
      minify: false
    }, msg.opts, { filepath: msg.name || "" });
    opts.minify = false;
    opts.useTabs = opts.indent === 0;
    opts.tabWidth = opts.indent || 8;
    let out;
    try {
      out = p(msg.text, Object.assign({}, opts, { print: true }));
    } catch (e) {
      return errorOut(e);
    }
    const res = { ok: true, text: out, ms: Date.now() - t0, verified: false };
    if (msg.verify && out !== msg.text) {
      try {
        const a = normalizeAst(p(msg.text, Object.assign({}, opts, { keepComments: true })), opts);
        const b = normalizeAst(p(out, Object.assign({}, opts, { keepComments: true })), opts);
        if (a !== b) return { ok: false, kind: "verify", message: "The formatted script would not parse to the same commands as the original, so it is not shown." };
        res.verified = true;
      } catch (e) {
        const r = errorOut(e);
        if (r.kind === "syntax") return { ok: false, kind: "verify", message: "The formatted script did not parse again (" + r.message + "), so it is not shown." };
        return r;
      }
    }
    res.ms = Date.now() - t0;
    return res;
  }
  self.onmessage = (ev) => {
    const msg = ev.data || {};
    let res;
    try {
      res = msg.op === "ping" ? { ok: true, text: "" } : run(msg);
    } catch (e) {
      res = errorOut(e);
    }
    res.id = msg.id;
    self.postMessage(res);
  };
})();
