// 测试用的 wx-server-sdk 内存替身，只实现云函数用到的数据库 API
const OP = Symbol('op');
const cmd = (op, v) => ({ [OP]: op, v });

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function matchValue(actual, expected) {
  if (expected && expected[OP]) {
    const { v } = expected;
    switch (expected[OP]) {
      case 'lt': return actual < v;
      case 'neq': return actual !== v;
      case 'gt': return actual > v;
      case 'lte': return actual <= v;
      case 'gte': return actual >= v;
      case 'in': return v.includes(actual);
      default: throw new Error('unsupported ' + expected[OP]);
    }
  }
  if (Array.isArray(actual) && !Array.isArray(expected)) return actual.includes(expected);
  return actual === expected;
}

function applyUpdate(doc, data) {
  for (const [k, v] of Object.entries(data)) {
    if (v && v[OP] === 'inc') doc[k] = (doc[k] || 0) + v.v;
    else doc[k] = v;
  }
}

function createFake() {
  const store = {};
  let seq = 0;
  const files = {};
  const coll = (name) => (store[name] = store[name] || new Map());

  function query(name, cond = {}, opts = {}) {
    const self = {
      field: () => query(name, cond, opts),
      orderBy: (f, dir) => query(name, cond, Object.assign({}, opts, { orderBy: [f, dir] })),
      skip: (n) => query(name, cond, Object.assign({}, opts, { skip: n })),
      limit: (n) => query(name, cond, Object.assign({}, opts, { limit: n })),
      rows() {
        let rows = [...coll(name).values()].filter((d) => Object.entries(cond).every(([k, v]) => matchValue(getPath(d, k), v)));
        if (opts.orderBy) {
          const [f, dir] = opts.orderBy;
          rows.sort((a, b) => (getPath(a, f) > getPath(b, f) ? 1 : -1) * (dir === 'desc' ? -1 : 1));
        }
        rows = rows.slice(opts.skip || 0);
        if (opts.limit) rows = rows.slice(0, opts.limit);
        return rows;
      },
      async get() { return { data: self.rows().map((r) => JSON.parse(JSON.stringify(r))) }; },
      async count() { return { total: self.rows().length }; },
      async update({ data }) {
        const rows = self.rows();
        rows.forEach((r) => applyUpdate(r, data));
        return { stats: { updated: rows.length } };
      }
    };
    return self;
  }

  const db = {
    command: {
      inc: (v) => cmd('inc', v), lt: (v) => cmd('lt', v), gt: (v) => cmd('gt', v),
      lte: (v) => cmd('lte', v), gte: (v) => cmd('gte', v), neq: (v) => cmd('neq', v), in: (v) => cmd('in', v),
      aggregate: {}
    },
    serverDate: () => new Date(),
    collection: (name) => ({
      doc: (id) => ({
        async get() {
          const d = coll(name).get(id);
          if (!d) throw new Error('not found');
          return { data: JSON.parse(JSON.stringify(d)) };
        },
        async set({ data }) { coll(name).set(id, Object.assign({ _id: id }, data)); },
        async update({ data }) {
          const d = coll(name).get(id);
          if (!d) throw new Error('not found');
          applyUpdate(d, data);
          return { stats: { updated: 1 } };
        },
        async remove() { coll(name).delete(id); }
      }),
      where: (cond) => query(name, cond),
      async add({ data }) {
        const id = `${name}_${++seq}`;
        coll(name).set(id, Object.assign({ _id: id }, data));
        return { _id: id };
      }
    })
  };

  const ctx = { openid: 'user_a' };
  const sentMessages = [];
  const sdk = {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    database: () => db,
    getWXContext: () => ({ OPENID: ctx.openid }),
    openapi: { subscribeMessage: { async send(msg) { sentMessages.push(msg); } } },
    async downloadFile({ fileID }) {
      return { fileContent: files[fileID] || Buffer.from('fake-image') };
    }
  };
  return { sdk, store, ctx, sentMessages };
}

module.exports = { createFake };
