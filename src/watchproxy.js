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
		if (field==='$isProxy')
			return true;
		if (field==='$removeProxy')
			return obj;
		if (field==='$roots')
			return ProxyObject.get(obj).roots_;


		let result = obj[field];

		// We only wrap objects and arrays in proxies.
		// Primitives and functions we leave alone.
		if (isObj(result)) {

			// Remove any proxies.
			result = result.$removeProxy || result;
			//#IFDEV
			if (result.$isProxy)
				throw new XElementError("Double wrapped proxy found.");
			//#ENDIF

			// Get (or create) the single unique instances of obj shared among all roots.
			// Keeping a shared copy lets us have multiple watchers on the same object,
			// and notify one when another changes the value.
			var proxyObj = ProxyObject.get(obj);
			var proxyResult = ProxyObject.get(result, proxyObj.roots_);

			// Keep track of paths.
			// Paths are built recursively as we descend, by getting the parent path and adding the new field.
			for (let root of proxyObj.roots_) {
				let path = proxyResult.paths_.get(root);

				// Set path for the first time.
				if (!path) {
					let parentPath = proxyObj.getPath_(root);
					path = [...parentPath, field];
					proxyResult.paths_.set(root, path);
				}
			}

			// If setting the value to an object or array, also create a proxy around that one.
			return proxyResult.proxy_;
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
		for (let root of proxyObj.roots_) {
			if (field !== 'length') {

				// Don't allow setting proxies on underlying obj.
				// This removes them recursivly in case of something like newVal=[Proxy(obj)].
				obj[field] = removeProxies(newVal);

				let path = [...proxyObj.getPath_(root), field];
				root.notify_('set', path, obj[field]);
			}
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
		for (let root of proxyObj.roots_) {
			let path = [...proxyObj.getPath_(root), field];
			root.notify_('delete', path);
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
		//this.object = obj;

		/**
		 * One shared proxy.
		 * @type Proxy */
		this.proxy_ = new Proxy(obj, handler);

		/**
		 * Can have multiple paths, one per root.
		 * @type {WeakMap<ProxyRoot, string[]>} */
		this.paths_ = new WeakMap();

		/**
		 *  One object can belong to multiple roots.
		 * @type {Set<ProxyRoot>} */
		this.roots_ = new Set(roots || []);
	}

	/**
	 * @param root {object}
	 * @returns {string[]} */
	getPath_(root) {
		if (!this.paths_.has(root))
			this.paths_.set(root, []);
		return this.paths_.get(root);
	}

	/**
	 * @param obj {object}
	 * @param roots {object[]=} Roots to add to new or existing object.
	 * @returns {ProxyObject} */
	static get(obj, roots) {
		obj = obj.$removeProxy || obj;

		var result = proxyObjects.get(obj);
		if (!result) {
			proxyObjects.set(obj, result = new ProxyObject(obj, roots));
		}
		// Merge in new roots
		else if (roots)
			result.roots_ = new Set([...result.roots_, ...roots]);

		return result;
	}
}

// TODO: Could this be replaced with a weakmap from the root  ,to the callbacks?
// Yes, but it wouldn't be as clean.
class ProxyRoot {
	constructor(root) {

		/**
		 * Root element we're watching.
		 * @type object */
		this.root_ = root;

		/**
		 * Functions to call when an object changes.
		 * @type {function[]} */
		this.callbacks_ = [];

		// Add root to the ProxyObjects.
		var po = ProxyObject.get(root);
		po.roots_.add(this);
	}

	notify_(/*action, path, value*/) {
		for (let callback of this.callbacks_)
			callback.apply(this.root_, arguments);
	}

	/**
	 * @param root {object}
	 * @returns {ProxyRoot} */
	static get(root) {
		root = root.$removeProxy || root;

		var po = proxyRoots.get(root);
		if (!po)
			proxyRoots.set(root, po= new ProxyRoot(root));
		return po;
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
var watchProxy = (root, callback) => {
	var proxyRoot = ProxyRoot.get(root);
	proxyRoot.callbacks_.push(callback);
	return proxyObjects.get(root).proxy_;
};