const { db } = require('../firebase');
const {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  increment,
  writeBatch,
} = require('firebase/firestore');

const POPULATE_MAP = {
  user: { collection: 'users', model: 'User' },
  store: { collection: 'users', model: 'User' },
  staff: { collection: 'staff', model: 'Staff' },
  supplier: { collection: 'suppliers', model: 'Supplier' },
  purchaseOrder: { collection: 'purchaseOrders', model: 'PurchaseOrder' },
  billId: { collection: 'bills', model: 'Bill' },
  usedBy: { collection: 'users', model: 'User' },
  createdBy: { collection: 'users', model: 'User' },
  approvedBy: { collection: 'users', model: 'User' },
  productId: { collection: 'products', model: 'Product' },
};

function toDate(value) {
  if (!value) return value;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  return value;
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => (current == null ? undefined : current[key]), obj);
}

function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (current[keys[i]] == null) current[keys[i]] = {};
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
}

function normalizeId(id) {
  if (id == null) return id;
  if (typeof id === 'object' && id._id != null) return String(id._id);
  if (typeof id === 'object' && id.id != null) return String(id.id);
  if (typeof id.toString === 'function' && typeof id !== 'object') return String(id);
  return String(id);
}

function docFromSnapshot(snapshot, Model) {
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  return Model.hydrate({ ...data, _id: snapshot.id, id: snapshot.id });
}

function compareValues(a, b) {
  if (a instanceof Date || b instanceof Date) {
    return toDate(a).getTime() - toDate(b).getTime();
  }
  if (typeof a === 'string' && typeof b === 'string') {
    return a.localeCompare(b);
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

function matchesOperator(fieldValue, operatorValue, doc) {
  if (operatorValue == null || typeof operatorValue !== 'object' || Array.isArray(operatorValue)) {
    if (fieldValue == null && operatorValue == null) return true;
    return normalizeId(fieldValue) === normalizeId(operatorValue);
  }

  if (operatorValue.$expr) {
    const expr = operatorValue.$expr;
    if (Array.isArray(expr.$lte) && expr.$lte.length === 2) {
      const left = getFieldValue(doc, expr.$lte[0]);
      const right = getFieldValue(doc, expr.$lte[1]);
      return left <= right;
    }
    return true;
  }

  if (operatorValue.$elemMatch) {
    if (!Array.isArray(fieldValue)) return false;
    return fieldValue.some((item) => matchesFilter(item, operatorValue.$elemMatch));
  }

  if (operatorValue.$regex) {
    const flags = operatorValue.$options || '';
    const regex = new RegExp(operatorValue.$regex, flags);
    return regex.test(String(fieldValue ?? ''));
  }

  if (operatorValue.$exists !== undefined) {
    const exists = fieldValue !== undefined && fieldValue !== null;
    return operatorValue.$exists ? exists : !exists;
  }

  if (operatorValue.$in) {
    return operatorValue.$in.some((val) => normalizeId(fieldValue) === normalizeId(val));
  }

  if (operatorValue.$ne !== undefined) {
    return normalizeId(fieldValue) !== normalizeId(operatorValue.$ne);
  }

  if (operatorValue.$gt !== undefined) {
    return compareValues(fieldValue, operatorValue.$gt) > 0;
  }
  if (operatorValue.$gte !== undefined) {
    return compareValues(fieldValue, operatorValue.$gte) >= 0;
  }
  if (operatorValue.$lt !== undefined) {
    return compareValues(fieldValue, operatorValue.$lt) < 0;
  }
  if (operatorValue.$lte !== undefined) {
    return compareValues(fieldValue, operatorValue.$lte) <= 0;
  }

  return normalizeId(fieldValue) === normalizeId(operatorValue);
}

function getFieldValue(doc, fieldExpr) {
  if (typeof fieldExpr !== 'string') return fieldExpr;
  if (fieldExpr.startsWith('$')) {
    return getNestedValue(doc, fieldExpr.slice(1));
  }
  return getNestedValue(doc, fieldExpr);
}

function matchesFilter(doc, filter = {}) {
  if (!filter || Object.keys(filter).length === 0) return true;

  if (filter.$or) {
    return filter.$or.some((clause) => matchesFilter(doc, clause));
  }

  return Object.entries(filter).every(([key, value]) => {
    if (key === '$or' || key === '$expr') return true;
    const fieldValue = getNestedValue(doc, key);
    if (key === '_id' || key === 'id') {
      return matchesOperator(doc._id, value, doc);
    }
    return matchesOperator(fieldValue, value, doc);
  });
}

function applyProjection(doc, projection) {
  if (!projection) return doc;
  const result = { ...doc };
  const includeFields = new Set();
  const excludeFields = new Set();

  projection.split(' ').forEach((field) => {
    if (!field) return;
    if (field.startsWith('+')) includeFields.add(field.slice(1));
    else if (field.startsWith('-')) excludeFields.add(field.slice(1));
    else includeFields.add(field);
  });

  if (includeFields.size > 0) {
    const picked = { _id: result._id, id: result.id };
    includeFields.forEach((field) => {
      picked[field] = result[field];
    });
    return picked;
  }

  excludeFields.forEach((field) => delete result[field]);
  return result;
}

function sortDocs(docs, sortSpec) {
  if (!sortSpec) return docs;
  const entries = Object.entries(sortSpec);
  return [...docs].sort((a, b) => {
    for (const [field, direction] of entries) {
      const cmp = compareValues(getNestedValue(a, field), getNestedValue(b, field));
      if (cmp !== 0) return direction === -1 ? -cmp : cmp;
    }
    return 0;
  });
}

function stripUndefined(obj) {
  if (obj == null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj;
  if (Array.isArray(obj)) return obj.map(stripUndefined);
  const result = {};
  Object.entries(obj).forEach(([key, value]) => {
    if (value !== undefined) result[key] = stripUndefined(value);
  });
  return result;
}

function runAggregatePipeline(docs, pipeline) {
  let result = [...docs];

  for (const stage of pipeline) {
    if (stage.$match) {
      result = result.filter((doc) => matchesFilter(doc, stage.$match));
    } else if (stage.$unwind) {
      const field = stage.$unwind.startsWith('$') ? stage.$unwind.slice(1) : stage.$unwind;
      const expanded = [];
      result.forEach((doc) => {
        const arr = getNestedValue(doc, field) || [];
        arr.forEach((item) => {
          expanded.push({ ...doc, [field]: item });
        });
      });
      result = expanded;
    } else if (stage.$group) {
      const groups = new Map();
      const idSpec = stage.$group._id;
      result.forEach((doc) => {
        let groupKey;
        let groupId;
        if (idSpec === null) {
          groupKey = '__all__';
          groupId = null;
        } else if (typeof idSpec === 'string' && idSpec.startsWith('$')) {
          const value = getNestedValue(doc, idSpec.slice(1));
          groupKey = JSON.stringify(value);
          groupId = value;
        } else if (typeof idSpec === 'object') {
          groupId = {};
          Object.entries(idSpec).forEach(([k, v]) => {
            const path = typeof v === 'string' && v.startsWith('$') ? v.slice(1) : v;
            groupId[k] = getNestedValue(doc, path);
          });
          groupKey = JSON.stringify(groupId);
        } else {
          groupKey = String(idSpec);
          groupId = idSpec;
        }

        if (!groups.has(groupKey)) {
          groups.set(groupKey, { _id: groupId, docs: [] });
        }
        groups.get(groupKey).docs.push(doc);
      });

      result = Array.from(groups.values()).map((group) => {
        const output = { _id: group._id };
        Object.entries(stage.$group).forEach(([key, expr]) => {
          if (key === '_id') return;
          if (expr.$sum) {
            const path = typeof expr.$sum === 'string' && expr.$sum.startsWith('$')
              ? expr.$sum.slice(1)
              : expr.$sum;
            output[key] = group.docs.reduce((sum, doc) => {
              const value = typeof path === 'number' ? path : getNestedValue(doc, path);
              return sum + (Number(value) || 0);
            }, 0);
          } else if (expr.$min) {
            const path = expr.$min.slice(1);
            output[key] = group.docs.reduce((min, doc) => {
              const value = toDate(getNestedValue(doc, path));
              if (min == null || value < min) return value;
              return min;
            }, null);
          } else if (expr.$count) {
            output[key] = group.docs.length;
          }
        });
        return output;
      });
    } else if (stage.$sort) {
      result = sortDocs(result, stage.$sort);
    } else if (stage.$limit) {
      result = result.slice(0, stage.$limit);
    } else if (stage.$count) {
      result = [{ count: result.length }];
    }
  }

  return result;
}

function createModel(collectionName, options = {}) {
  const {
    hiddenFields = [],
    beforeSave,
    methods = {},
    statics = {},
    virtuals = {},
  } = options;

  class Model {
    constructor(data = {}) {
      Object.assign(this, data);
      if (!this._id && this.id) this._id = this.id;
      this._isNew = !this._id;
      this._modifiedPaths = new Set();
      this._original = { ...data };
    }

    markModified(path) {
      this._modifiedPaths.add(path);
    }

    isModified(path) {
      if (!path) return this._modifiedPaths.size > 0 || this._isNew;
      return this._isNew || this._modifiedPaths.has(path) || this[path] !== this._original[path];
    }

    toObject() {
      const obj = {};
      Object.keys(this).forEach((key) => {
        if (key.startsWith('_')) return;
        obj[key] = this[key];
      });
      obj._id = this._id;
      obj.id = this._id;
      Object.entries(virtuals).forEach(([name, getter]) => {
        obj[name] = getter.call(this);
      });
      return obj;
    }

    toJSON() {
      if (typeof methods.toJSON === 'function') return methods.toJSON.call(this);
      const obj = this.toObject();
      hiddenFields.forEach((field) => delete obj[field]);
      return obj;
    }

    async save(saveOptions = {}) {
      if (beforeSave) {
        await beforeSave.call(this, this._isNew);
      }

      const payload = stripUndefined(this.toObject());
      delete payload._id;
      delete payload.id;

      if (this._isNew) {
        const ref = await addDoc(collection(db, collectionName), payload);
        this._id = ref.id;
        this.id = ref.id;
        this._isNew = false;
        this._original = this.toObject();
        this._modifiedPaths.clear();
        return this;
      }

      await updateDoc(doc(db, collectionName, this._id), payload);
      this._original = this.toObject();
      this._modifiedPaths.clear();
      return this;
    }
  }

  Object.entries(methods).forEach(([name, fn]) => {
    Model.prototype[name] = fn;
  });

  Model.hydrate = function hydrate(data) {
    const instance = new Model(data);
    instance._isNew = false;
    instance._original = { ...data };
    return instance;
  };

  Model.collectionName = collectionName;

  Model._applyHiddenFields = function _applyHiddenFields(doc, projection) {
    if (!doc) return doc;
    const clone = { ...doc };

    if (projection) {
      const plusFields = projection
        .split(' ')
        .filter((field) => field.startsWith('+'))
        .map((field) => field.slice(1));
      const projected = applyProjection(clone, projection);
      hiddenFields.forEach((field) => {
        if (!plusFields.includes(field)) delete projected[field];
      });
      return projected;
    }

    hiddenFields.forEach((field) => delete clone[field]);
    return clone;
  };

  Model._fetchAll = async function _fetchAll() {
    const snapshot = await getDocs(collection(db, collectionName));
    return snapshot.docs.map((snap) => docFromSnapshot(snap, Model));
  };

  Model._fetchWithSimpleFilters = async function _fetchWithSimpleFilters(filter = {}) {
    const constraints = [];
    const memoryFilter = { ...filter };

    Object.entries(filter).forEach(([key, value]) => {
      if (key === '$or' || key === '$expr') return;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if (value.$regex || value.$elemMatch || value.$exists !== undefined || value.$in || value.$ne) return;
        if (value.$gt !== undefined || value.$gte !== undefined || value.$lt !== undefined || value.$lte !== undefined) {
          if (value.$gte !== undefined) {
            constraints.push(where(key, '>=', value.$gte));
            delete memoryFilter[key];
          } else if (value.$gt !== undefined) {
            constraints.push(where(key, '>', value.$gt));
            delete memoryFilter[key];
          } else if (value.$lte !== undefined) {
            constraints.push(where(key, '<=', value.$lte));
            delete memoryFilter[key];
          } else if (value.$lt !== undefined) {
            constraints.push(where(key, '<', value.$lt));
            delete memoryFilter[key];
          }
        }
        return;
      }
      if (key === '_id' || key === 'id') return;
      constraints.push(where(key, '==', value));
      delete memoryFilter[key];
    });

    let docs;
    if (constraints.length > 0) {
      const q = query(collection(db, collectionName), ...constraints);
      const snapshot = await getDocs(q);
      docs = snapshot.docs.map((snap) => docFromSnapshot(snap, Model));
    } else {
      docs = await Model._fetchAll();
    }

    return docs.filter((docItem) => matchesFilter(docItem, memoryFilter));
  };

  Model.find = function find(filter = {}) {
    return new Query(Model, filter);
  };

  Model.findOne = function findOne(filter = {}) {
    return new Query(Model, filter, { single: true });
  };

  Model.findById = function findById(id) {
    return new Query(Model, { _id: id }, { single: true, byId: true });
  };

  Model.create = async function create(data) {
    const items = Array.isArray(data) ? data : [data];
    const created = [];
    for (const item of items) {
      const instance = new Model(item);
      await instance.save();
      created.push(instance);
    }
    return Array.isArray(data) ? created : created[0];
  };

  Model.countDocuments = async function countDocuments(filter = {}) {
    const docs = await Model._fetchWithSimpleFilters(filter);
    return docs.length;
  };

  Model.exists = async function exists(filter = {}) {
    const docs = await Model._fetchWithSimpleFilters(filter);
    return docs.length > 0 ? { _id: docs[0]._id } : null;
  };

  Model.distinct = async function distinct(field, filter = {}) {
    const docs = await Model._fetchWithSimpleFilters(filter);
    const values = new Set();
    docs.forEach((docItem) => {
      const value = getNestedValue(docItem, field);
      if (value !== undefined && value !== null) values.add(value);
    });
    return Array.from(values);
  };

  Model.aggregate = async function aggregate(pipeline = []) {
    const docs = await Model._fetchAll();
    return runAggregatePipeline(docs.map((d) => d.toObject()), pipeline);
  };

  Model.findOneAndUpdate = async function findOneAndUpdate(filter, update, opts = {}) {
    const docs = await Model._fetchWithSimpleFilters(filter);
    const existing = docs[0];
    if (!existing) return null;

    const updated = applyUpdate(existing.toObject(), update);
    if (beforeSave) {
      const instance = Model.hydrate(updated);
      await beforeSave.call(instance, false);
      Object.assign(updated, instance.toObject());
    }

    const payload = stripUndefined({ ...updated });
    const id = payload._id;
    delete payload._id;
    delete payload.id;

    if (opts.upsert && !existing) {
      const ref = await addDoc(collection(db, collectionName), payload);
      return Model.hydrate({ ...payload, _id: ref.id, id: ref.id });
    }

    await setDoc(doc(db, collectionName, id), payload, { merge: true });
    const result = Model.hydrate({ ...payload, _id: id, id });
    return opts.new === false ? existing : result;
  };

  Model.findByIdAndUpdate = async function findByIdAndUpdate(id, update, opts = {}) {
    const docId = normalizeId(id);
    const snap = await getDoc(doc(db, collectionName, docId));
    if (!snap.exists()) return null;

    if (update.$inc) {
      const incPayload = {};
      Object.entries(update.$inc).forEach(([key, value]) => {
        incPayload[key] = increment(value);
      });
      await updateDoc(doc(db, collectionName, docId), incPayload);
      const refreshed = await getDoc(doc(db, collectionName, docId));
      const result = docFromSnapshot(refreshed, Model);
      return opts.new === false ? docFromSnapshot(snap, Model) : result;
    }

    return Model.findOneAndUpdate({ _id: docId }, update, opts);
  };

  Model.findOneAndDelete = async function findOneAndDelete(filter) {
    const docs = await Model._fetchWithSimpleFilters(filter);
    const existing = docs[0];
    if (!existing) return null;
    await deleteDoc(doc(db, collectionName, existing._id));
    return existing;
  };

  Model.findByIdAndDelete = async function findByIdAndDelete(id) {
    return Model.findOneAndDelete({ _id: id });
  };

  Model.insertMany = async function insertMany(items = []) {
    const batch = writeBatch(db);
    const created = [];

    items.forEach((item) => {
      const ref = doc(collection(db, collectionName));
      const payload = stripUndefined({ ...item });
      delete payload._id;
      delete payload.id;
      batch.set(ref, payload);
      created.push({ ...payload, _id: ref.id, id: ref.id });
    });

    await batch.commit();
    return created.map((item) => Model.hydrate(item));
  };

  Object.entries(statics).forEach(([name, fn]) => {
    Model[name] = fn.bind(Model);
  });

  return Model;
}

function applyUpdate(existing, update) {
  const docData = { ...existing };

  if (update.$set) {
    Object.entries(update.$set).forEach(([key, value]) => setNestedValue(docData, key, value));
  }

  if (update.$inc) {
    Object.entries(update.$inc).forEach(([key, value]) => {
      const current = getNestedValue(docData, key) || 0;
      setNestedValue(docData, key, current + value);
    });
  }

  Object.entries(update).forEach(([key, value]) => {
    if (key.startsWith('$')) return;
    docData[key] = value;
  });

  return docData;
}

class Query {
  constructor(Model, filter = {}, options = {}) {
    this.Model = Model;
    this.filter = filter;
    this.options = options;
    this.sortSpec = null;
    this.limitValue = null;
    this.skipValue = 0;
    this.projection = null;
    this.populateSpecs = [];
  }

  select(projection) {
    this.projection = projection;
    return this;
  }

  sort(spec) {
    this.sortSpec = spec;
    return this;
  }

  limit(value) {
    this.limitValue = value;
    return this;
  }

  skip(value) {
    this.skipValue = value;
    return this;
  }

  populate(path, selectFields) {
    this.populateSpecs.push({ path, selectFields });
    return this;
  }

  async _execute() {
    let docs;

    if (this.options.byId) {
      const id = normalizeId(this.filter._id || this.filter.id);
      const snap = await getDoc(doc(db, this.Model.collectionName, id));
      docs = snap.exists() ? [docFromSnapshot(snap, this.Model)] : [];
      docs = docs.filter((docItem) => matchesFilter(docItem, this.filter));
    } else {
      docs = await this.Model._fetchWithSimpleFilters(this.filter);
    }

    docs = sortDocs(docs, this.sortSpec);

    if (this.skipValue) docs = docs.slice(this.skipValue);
    if (this.limitValue != null) docs = docs.slice(0, this.limitValue);

    for (const spec of this.populateSpecs) {
      docs = await populateDocs(docs, spec.path, spec.selectFields);
    }

    docs = docs.map((docItem) => {
      const plain = typeof docItem.toObject === 'function' ? docItem.toObject() : docItem;
      const projected = this.Model._applyHiddenFields(plain, this.projection);
      return this.Model.hydrate(projected);
    });

    if (this.options.single) return docs[0] || null;
    return docs;
  }

  then(resolve, reject) {
    return this._execute().then(resolve, reject);
  }

  catch(reject) {
    return this._execute().catch(reject);
  }
}

async function populateDocs(docs, path, selectFields) {
  const populateInfo = POPULATE_MAP[path];
  if (!populateInfo) return docs;

  const ids = [...new Set(
    docs
      .map((docItem) => normalizeId(getNestedValue(docItem, path)))
      .filter(Boolean)
  )];

  const relatedDocs = new Map();
  await Promise.all(ids.map(async (id) => {
    const snap = await getDoc(doc(db, populateInfo.collection, id));
    if (!snap.exists()) return;
    const data = { ...snap.data(), _id: snap.id, id: snap.id };
    if (selectFields) {
      const fields = selectFields.split(' ').filter(Boolean);
      const picked = { _id: data._id, id: data.id };
      fields.forEach((field) => {
        picked[field] = data[field];
      });
      relatedDocs.set(id, picked);
    } else {
      relatedDocs.set(id, data);
    }
  }));

  return docs.map((docItem) => {
    const clone = typeof docItem.toObject === 'function' ? docItem.toObject() : { ...docItem };
    const refId = normalizeId(getNestedValue(clone, path));
    if (refId && relatedDocs.has(refId)) {
      clone[path] = relatedDocs.get(refId);
    }
    return typeof docItem.toObject === 'function' ? docItem.constructor.hydrate(clone) : clone;
  });
}

const mongooseCompat = {
  Types: {
    ObjectId: {
      isValid(id) {
        return typeof id === 'string' && id.length > 0;
      },
    },
  },
};

module.exports = {
  createModel,
  mongooseCompat,
  normalizeId,
  toDate,
};
