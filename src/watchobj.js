"use strict";

var handler = {
	/**
	 * Overridden to wrap returned values in a Proxy, so we can see when they're changed.
	 * And to keep track of the path as we traverse deeper into an object.
	 * @param obj {Array|object}
	 * @param field {string} An object key or array index.
	 * @returns {*} */
	get(obj, field) {

		// Special properties
		if (field==='isProxy')
			return true;
		if (field==='removeProxy')
			return obj;
		if (field==='$roots')
			return ProxyObject.get(obj).roots;


		let result = obj[field];
		if (isObj(result)) {

			// Remove any proxies.
			if (result.isProxy)
				result = result.removeProxy;
			//#IFDEV
			if (result.isProxy)
				throw new XElementError("Double wrapped proxy found.");
			//#ENDIF

			// Get (or create) the single unique instances of obj shared among all roots.
			// Keeping a shared copy lets us have multiple watchers on the same object,
			// and notify one when another changes the value.
			var proxyObj = ProxyObject.get(obj);
			var proxyResult = ProxyObject.get(result, proxyObj.roots);

			// Keep track of paths.
			// Paths are built recursively as we descend, by getting the parent path and adding the new field.
			for (let root of proxyObj.roots) {
				let path = proxyResult.paths.get(root);

				// Set path for the first time.
				if (!path) {
					let parentPath = proxyObj.getPath(root);
					path = [...parentPath, field];
					proxyResult.paths.set(root, path);
				}
			}

			// If setting the value to an object or array, also create a proxy around that one.
			return proxyResult.proxy;
		}
		return result;
	},

	/**
	 * Trap called whenever anything in an array or object is set.
	 * Changing and shifting array values will also call this function.
	 * @param obj {Array|object} root or an object within root that we're setting a property on.
	 * @param field {string} An object key or array index.
	 * @param newVal {*}
	 * @returns {boolean} */
	set(obj, field, newVal) {

		var proxyObj = ProxyObject.get(obj);
		for (let root of proxyObj.roots) {
			if (field === 'length')
				continue;

			// Don't allow setting proxies on underlying obj.
			// This removes them recursivly in case of something like newVal=[Proxy(obj)].
			obj[field] = removeProxies(newVal);

			let path = [...proxyObj.getPath(root), field];
			root.notify('set', path, obj[field]);
		}

		return 1; // Proxy requires us to return true.
	},

	/**
	 * Trap called whenever anything in an array or object is deleted.
	 * @param obj {Array|object} root or an object within root that we're deleting a property on.
	 * @param field {int|string} An object key or array index.
	 * @returns {boolean} */
	deleteProperty(obj, field) {
		if (Array.isArray(obj))
			obj.splice(field, 1);
		else
			delete obj[field];

		var proxyObj = ProxyObject.get(obj);
		for (let root of proxyObj.roots) {
			let path = [...proxyObj.getPath(root), field];
			root.notify('delete', path);
		}

		return 1; // Proxy requires us to return true.
	}
};


// One of these will exist for each object, regardless of how many roots it's in.
class ProxyObject {
	constructor(obj, roots) {

		/**
		 * One shared proxy
		 * @type object */
		this.object = obj;

		/**
		 * One shared proxy.
		 * @type Proxy */
		this.proxy = new Proxy(obj, handler);

		/**
		 * Can have multiple paths, one per root.
		 * @type {WeakMap<ProxyRoot, string[]>} */
		this.paths = new WeakMap();

		/**
		 *  One object can belong to multiple roots.
		 * @type {Set<ProxyRoot>} */
		this.roots = new Set(roots || []);
	}

	/**
	 * @param root {object}
	 * @returns {string[]} */
	getPath(root) {
		if (!this.paths.has(root))
			this.paths.set(root, []);
		return this.paths.get(root);
	}

	/**
	 * @param obj {object}
	 * @param roots {object[]=}
	 * @returns {ProxyObject} */
	static get(obj, roots) {
		if (obj.isProxy)
			obj = obj.removeProxy;

		if (!proxyObjects.has(obj))
			proxyObjects.set(obj, new ProxyObject(obj, roots));

		return proxyObjects.get(obj);
	}
}

class ProxyRoot {
	constructor(root) {

		/**
		 * Root element we're watching.
		 * @type object */
		this.root = root;

		/**
		 * Functions to call when an object changes.
		 * @type {function[]} */
		this.callbacks = [];

		// Add root to the ProxyObjects.
		var po = ProxyObject.get(root);
		po.roots.add(this);
	}

	notify(action, path, value) {
		for (let callback of this.callbacks)
			callback.apply(this.root, arguments);
	}

	/**
	 * @param root {object}
	 * @returns {ProxyRoot} */
	static get(root) {
		if (root.isProxy)
			root = root.removeProxy;

		if (!proxyRoots.has(root))
			proxyRoots.set(root, new ProxyRoot(root));
		return proxyRoots.get(root);
	}
}


/**
 * @type {WeakMap<object, ProxyRoot>} */
var proxyRoots = new WeakMap();

/**
 * @type {WeakMap<object, ProxyObject>} */
var proxyObjects = new WeakMap();  // Map from objects back to their roots.




/**
 * Create a copy of root, where callback() is called whenever anything within object is added, removed, or modified.
 * Monitors all deeply nested properties including array operations.
 * Inspired by: stackoverflow.com/q/41299642
 * @param root {object}
 * @param callback {function(action:string, path:string[], value:string?)} Action is 'set' or 'delete'.
 * @returns {Proxy} */
var watchObj = (root, callback) => {
	var proxyRoot = ProxyRoot.get(root);
	proxyRoot.callbacks.push(callback);
	return proxyObjects.get(root).proxy;
};