var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};
var CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ";
var RELAY = /* @__PURE__ */ new Set(["state", "hex", "hexAck", "played", "death"]);
var Room = class {
  static {
    __name(this, "Room");
  }
  constructor(state, env) {
    this.sockets = [];
    this.rematch = /* @__PURE__ */ new Set();
  }
  alive() {
    this.sockets = this.sockets.filter((s) => s.ws.readyState === 1);
    return this.sockets;
  }
  broadcast(obj) {
    const msg = JSON.stringify(obj);
    for (const s of this.alive()) {
      try {
        s.ws.send(msg);
      } catch (e) {
      }
    }
  }
  other(ws) {
    return this.alive().find((s) => s.ws !== ws);
  }
  async fetch(req) {
    const url = new URL(req.url);
    if (!url.pathname.endsWith("/ws")) return new Response("room", { headers: CORS });
    if (req.headers.get("Upgrade") !== "websocket")
      return new Response("expected websocket", { status: 426, headers: CORS });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const name = (url.searchParams.get("name") || "Player").slice(0, 14);
    this.handle(server, name);
    return new Response(null, { status: 101, webSocket: client });
  }
  handle(ws, name) {
    ws.accept();
    if (this.alive().length >= 2) {
      try {
        ws.send(JSON.stringify({ t: "full" }));
        ws.close(1e3, "full");
      } catch (e) {
      }
      return;
    }
    this.sockets.push({ ws, name });
    ws.addEventListener("message", (ev) => this.onMsg(ws, ev));
    ws.addEventListener("close", () => this.onGone(ws));
    ws.addEventListener("error", () => this.onGone(ws));
    this.broadcast({ t: "roster", names: this.alive().map((s) => s.name) });
    if (this.alive().length === 2) {
      this.rematch.clear();
      this.broadcast({ t: "start", names: this.alive().map((s) => s.name) });
    }
  }
  onMsg(ws, ev) {
    let m;
    try {
      m = JSON.parse(ev.data);
    } catch (e) {
      return;
    }
    if (!m || typeof m.t !== "string") return;
    if (m.t === "rematch") {
      this.rematch.add(ws);
      const o2 = this.other(ws);
      if (o2) {
        try {
          o2.ws.send(JSON.stringify({ t: "rematchReq" }));
        } catch (e) {
        }
      }
      const live = this.alive();
      if (live.length === 2 && live.every((s) => this.rematch.has(s.ws))) {
        this.rematch.clear();
        this.broadcast({ t: "start", names: live.map((s) => s.name) });
      }
      return;
    }
    if (!RELAY.has(m.t)) return;
    const o = this.other(ws);
    if (o) {
      try {
        o.ws.send(JSON.stringify(m));
      } catch (e) {
      }
    }
  }
  onGone(ws) {
    this.rematch.delete(ws);
    const wasIn = this.sockets.some((s) => s.ws === ws);
    this.sockets = this.sockets.filter((s) => s.ws !== ws);
    if (wasIn) this.broadcast({ t: "gone" });
  }
};
var worker_default = {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (url.pathname === "/create") {
      let code = "";
      for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      return new Response(JSON.stringify({ code }), {
        headers: { "Content-Type": "application/json", ...CORS }
      });
    }
    const m = url.pathname.match(/^\/room\/([A-Za-z0-9]{4,6})\/ws$/);
    if (m) {
      const id = env.ROOM.idFromName(m[1].toUpperCase());
      return env.ROOM.get(id).fetch(req);
    }
    if (url.pathname === "/") return new Response("deadspin duel relay", { headers: CORS });
    return new Response("not found", { status: 404, headers: CORS });
  }
};

// ../../../Users/Jordan/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../Users/Jordan/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-YKOtsn/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../../../Users/Jordan/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-YKOtsn/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  Room,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
