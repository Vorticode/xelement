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
		if (field==='$trigger') {
			return (path) => {
				let roots = ProxyObject.get_(obj).roots_;
				for (let root of roots)
					root.notify_('set', path || [], obj);
				return roots;
			}
		}

		// Debugging functions
		if (field==='$roots')
			return ProxyObject.get_(obj).roots_;
		if (field==='$subscribers') {
			return Array.from(ProxyObject.get_(obj).roots_)
				.map((x) => x.callbacks_)
				.reduce((a, b) => [...a, ...b])
				.map((x) => x('info'))
				.reduce((a, b) => [...a, ...b])
		}



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
			let proxyObj = ProxyObject.get_(obj);
			let proxyResult = ProxyObject.get_(result, proxyObj.roots_);

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

		var proxyObj = ProxyObject.get_(obj);
		for (let root of proxyObj.roots_) {

			// Don't allow setting proxies on underlying obj.
			// This removes them recursivly in case of something like newVal=[Proxy(obj)].
			newVal = removeProxies(newVal);
			let oldVal = obj[field];

			// Set the value.
			// TODO: This can trigger notification if field was created on obj by defineOwnProperty()!
			// Should I use .$disableWatch?
			obj[field] = newVal;

			// Notify
			let path = [...proxyObj.getPath_(root), field];
			root.notify_('set', path, newVal, oldVal);

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

		var proxyObj = ProxyObject.get_(obj);
		for (let root of proxyObj.roots_) {
			let path = [...proxyObj.getPath_(root), field];
			root.notify_('delete', path);
		}

		return 1; // Proxy requires us to return true.
	}
};

/**
 * Wrapper around every instance of an object that's being watched.
 * One of these will exist for each object, regardless of how many roots it's in. */
class ProxyObject {
	constructor(obj, roots) {

		/**
		 * One shared proxy.
		 * @type Proxy */
		this.proxy_ = new Proxy(obj, handler);

		/**
		 * A map of every root that has a subscription to this object and the path from that root to the object.
		 * Can have multiple paths, one per root.
		 * @type {WeakMap<ProxyRoot, string[]>} */
		this.paths_ = new WeakMap();

		/**
		 *  One object can belong to multiple roots.
		 * @type {Set<ProxyRoot>} */
		this.roots_ = new Set(roots || []);

		// Modify array functions to search for unproxied values:
		// TODO: .$removeProxy doesn't remove these functions from the array!
		if (Array.isArray(this.proxy_)) {

			// Because this.proxy_ is a Proxy, we have to replace the functions
			// on it in this special way by using Object.defineProperty()
			// Directly assigning this.proxy_.indexOf = ... calls the setter and leads to infinite recursion.
			for (let func of ['indexOf', 'lastIndexOf', 'includes']) // TODO: Support more array functions.

				Object.defineProperty(this.proxy_, func, {
					enumerable: false,
					get: function() {
						// Return a new indexOf function.
						return function (item) {
							item = item.$removeProxy===undefined ? item : item.$removeProxy;
							return Array.prototype[func].call(obj, item);
						}
					}
				});


			var self = this;


			// Need to intercept all functions like these that perform multiple operations.
			// That way we set and clear ProxyObj.currentOp while they're happening.
			// And rebuildChildren() can only be applied at the last one.
			for (let func of ['push', 'pop', 'splice', 'shift', 'sort', 'reverse', 'unshift'])
				Object.defineProperty(this.proxy_, func, {
					enumerable: false,
					get: function() {
						// Return a new indexOf function.
						return function () {

							// Apply array operations on the underlying watched object, so we don't notify a jillion times.
							let result =  Array.prototype[func].apply(obj, arguments);

							// Rebuild the array indices inside the proxy ojects.
							// This is covered by the test Watch.arrayShift2()
							// TODO: This can be faster if we only update the affected array elements.
							if (['splice', 'shift', 'sort', 'reverse', 'unshift'].includes(func)) // ops that modify within the array.
								ProxyObject.rebuildArray(obj);

							// Trigger a single notfication change.
							self.proxy_.$trigger();
							return result;
						}
					}
				});


		}
	}

	/**
	 * For item, find all proxyRoots and update their paths such that they end with path.
	 * Then we recurse and do the same for the children, appending to path as we go.
	 * Ths effectively lets us update the path of all of item's subscribers.
	 * This is necessary for example when an array is spliced and the paths after the splice need to be updated.
	 * @param item {object|*[]}
	 * @param path {string[]} */
	static rebuildArray(item, path, visited) {
		path = path || [];
		visited = visited || new WeakSet();

		if (visited.has(item))
			return;
		visited.add(item);

		if (path.length) {
			let itemPo = proxyObjects.get(item.$removeProxy || item); // Get the ProxyObject for this array item.
			if (!itemPo)
				return; // because nothing is watching this array element.

			// Update all paths
			let map = itemPo.getAllRootsAndPaths_(); // Get all roots and the paths that point to this array item.
			for (let [root, oldPath] of map) {

				// Swap end of oldPath with the new path.
				let start = oldPath.length - path.length;
				if (start >= 0)
					for (let j = start; j < oldPath.length; j++)
						oldPath[j] = path[j - start];
			}
		}

		// Recurse through children to update their paths too.
		// This is testesd by the arrayShiftRecurse() test.
		if (Array.isArray(item))
			for (let i=0; i<item.length; i++)
				ProxyObject.rebuildArray(item[i], [...path, i+''], visited);
		else if (isObj(item))
			for (let i in item)
				if (Array.isArray(item[i]) || isObj(item[i]))
					ProxyObject.rebuildArray(item[i], [...path, i+''], visited);
	}

	/**
	 * Get a map of all root objects watching this object, and the path from those roots to this object.
	 * @returns {Map} */
	getAllRootsAndPaths_() {
		let result = new Map();
		for (let root of this.roots_)
			result.set(root, this.getPath_(root));
		return result;
	}

	/**
	 * @param root {object}
	 * @returns {string[]} */
	getPath_(root) {
		//if (!this.paths_.has(root)) // TODO: why does this create it?
		//	this.paths_.set(root, []);
		return this.paths_.get(root) || [];
	}

	/**
	 * @param obj {object}
	 * @param roots {object[]|Set<object>=} Roots to add to new or existing object.
	 * @returns {ProxyObject} */
	static get_(obj, roots) {
		obj = obj.$removeProxy || obj;

		var result = proxyObjects.get(obj);
		if (!result)
			proxyObjects.set(obj, result = new ProxyObject(obj, roots));

		// Merge in new roots
		else if (roots)
			result.roots_ = new Set([...result.roots_, ...roots]);

		return result;
	}
}


/**
 * Wrapper around an object that has its descendants being watched.
 * We use a path to get from a ProxyRoot to an instance of a ProxyObject.
 * One ProxyObject may belong to multiple ProxyRoots. */
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
		var po = ProxyObject.get_(root);
		po.roots_.add(this);
	}

	notify_(/*action, path, value*/) {
		for (let callback of this.callbacks_)
			callback.apply(this.root_, arguments);
	}

	/**
	 * @param root {object}
	 * @returns {ProxyRoot} */
	static get_(root) {
		root = root.$removeProxy || root;

		var po = proxyRoots.get(root);
		if (!po)
			proxyRoots.set(root, po = new ProxyRoot(root));
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
	//#IFDEV
	if (!isObj(root))
		throw new XElementError('Can only watch objects');
	//#ENDIF
	var proxyRoot = ProxyRoot.get_(root);
	proxyRoot.callbacks_.push(callback);
	return proxyObjects.get(root).proxy_;
};