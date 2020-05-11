"use strict";



/**
 * @property object.$isProxy
 * @property object.$removeProxy
 * @property object.$trigger
 * */

var arrayRead = ['indexOf', 'lastIndexOf', 'includes'];
var arrayWrite = ['push', 'pop', 'splice', 'shift', 'sort', 'reverse', 'unshift'];

/**
 * Handler object used when calling WatchUtil.getProxy() */
var handler = {
	/**
	 * Overridden to wrap returned values in a Proxy, so we can see when they're changed.
	 * And to keep track of the path as we traverse deeper into an object.
	 * @param obj {Array|object}
	 * @param field {string} An object key or array index.
	 * @returns {*} */
	get(obj, field) {

		// Special properties
		if (field[0] === '$') {
			if (field === '$isProxy')
				return true;
			if (field === '$removeProxy')
				return obj;
			if (field === '$trigger') {
				return (path) => {
					let roots = WatchUtil.getRoots(obj);
					for (let root of roots)
						WatchUtil.notifyCallbacks(root, 'set', path || [], obj);
					//root.notify_('set', path || [], obj);
					return roots;
				}
			}

			// Debugging functions
			if (field === '$roots')
				return WatchUtil.getRoots(obj);
			if (field === '$subscribers') {
				return Array.from(WatchUtil.getRoots(obj))
					.map((x) => x.callbacks_)
					.reduce((a, b) => [...a, ...b])
					.map((x) => x('info'))
					.reduce((a, b) => [...a, ...b])
			}
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

			// Make sure the path from the root to the object's field is tracked:
			let roots = WatchUtil.getRoots(obj);
			for (let root of roots) { // Get all paths from the roots to the parent.
				let parentPaths = WatchUtil.getPaths(root, obj);
				for (let parentPath of parentPaths) {

					// Combine each path with the field name.
					WatchUtil.addPath(root, [...parentPath, field], result); // Add to our list of tracked paths.
				}
			}

			return WatchUtil.getProxy(result);
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
		newVal = removeProxies(newVal);

		// Don't allow setting proxies on underlying obj.
		// This removes them recursivly in case of something like newVal=[Proxy(obj)].
		let oldVal = obj[field];

		// Set the value.
		// TODO: This can trigger notification if field was created on obj by defineOwnProperty()!
		// Should I use .$disableWatch?
		obj[field] = newVal;


		let roots = WatchUtil.getRoots(obj);
		for (let root of roots) { // Notify
			let parentPaths = WatchUtil.getPaths(root, obj);
			for (let parentPath of parentPaths) {
				let path = [...parentPath, field];
				WatchUtil.notifyCallbacks(root, 'set', path, newVal, oldVal);
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

		let roots = WatchUtil.getRoots(obj);
		for (let root of roots) {
			let parentPaths = WatchUtil.getPaths(root, obj);
			for (let parentPath of parentPaths) {
				let path = [...parentPath, field];
				WatchUtil.notifyCallbacks(root, 'set', path);
			}
		}

		return 1; // Proxy requires us to return true.
	}
};






var WatchUtil = {

	/**
	 * Get or create proxy for an object.
	 * An object will never have more than one proxy.
	 * @returns {Proxy} */
	getProxy: function(obj) {
		let proxy = WatchUtil.proxies.get(obj);
		if (!proxy) {
			WatchUtil.proxies.set(obj, proxy = new Proxy(obj, handler));

			if (Array.isArray(obj)) {

				// Because this.proxy_ is a Proxy, we have to replace the functions
				// on it in this special way by using Object.defineProperty()
				// Directly assigning this.proxy_.indexOf = ... calls the setter and leads to infinite recursion.
				for (let func of arrayRead) // TODO: Support more array functions.

					Object.defineProperty(proxy, func, {
						enumerable: false,
						get: () => // Return a new version of indexOf or the other functions.
							(item) => Array.prototype[func].call(obj, removeProxy(item))
					});

				/*
				 * Intercept array modification functions so that we only send one nofication instead
				 * of a notification every time an array item is moved (shift, unshift, splice) or the length changes. */
				for (let func of arrayWrite)
					Object.defineProperty(proxy, func, {
						configurable: true,
						enumerable: false,
						get: () =>

							// Return a new version of push or the other functions.
							function () {

								let originalLength = obj.length;
								var startIndex = 0;
								if (func === 'push')
									startIndex = originalLength;
								else if (func === 'pop')
									startIndex = originalLength - 1;
								else if (func === 'splice')
									startIndex = arguments[0] < 0 ? originalLength - arguments[0] : arguments[0];


								// Apply array operations on the underlying watched object, so we don't notify a jillion times.
								let result = Array.prototype[func].apply(obj, arguments);

								// Rebuild the array indices inside the proxy objects.
								// This is covered by the test Watch.arrayShift2()
								// TODO: This can be faster if we only update the affected array elements.
								if (['splice', 'shift', 'sort', 'reverse', 'unshift'].includes(func)) { // ops that modify within the array.
									WatchUtil.rebuildArray(obj, startIndex, null, null);
								}

								// Trigger a notification for every array element changed, instead of one for eavery sub-operation.
								// Commented out because it messes up xloops.





								let roots = WatchUtil.getRoots(obj);
								for (let root of roots) {
									let parentPaths = WatchUtil.getPaths(root, obj);
									for (let parentPath of parentPaths) {
										for (var i = startIndex; i < proxy.length; i++)
											WatchUtil.notifyCallbacks(root, 'set', [...parentPath, i + ''], obj[i]);
										for (i; i<originalLength; i++)
											WatchUtil.notifyCallbacks(root, 'delete', [...parentPath, i + '']);
									}
								}

								// Old version that notifies for the whole array instead of only the items changed:
								//proxy.$trigger();

								return result;
							}
					});
			}
		}

		return proxy;
	},

	/**
	 * For item, find all proxyRoots and update their paths such that they end with path.
	 * Then we recurse and do the same for the children, appending to path as we go.
	 * Ths effectively lets us update the path of all of item's subscribers.
	 * This is necessary for example when an array is spliced and the paths after the splice need to be updated.
	 * @param obj {object|*[]}
	 * @param startIndex {int?} If set, only rebuild array elements at and after this index.
	 * @param path {string[]=}
	 * @param visited {WeakSet=} */
	rebuildArray: function(obj, startIndex, path, visited) {
		path = path || [];
		visited = visited || new WeakSet();
		if (startIndex === undefined)
			startIndex = 0;

		if (visited.has(obj))
			return;
		visited.add(obj);

		if (path.length) {

			let roots = WatchUtil.roots.get(obj);
			if (!roots) // because nothing is watching this array element.
				return;

			for (let root of roots) {
				let parentPaths = WatchUtil.getPaths(root, obj);
				for (let i in parentPaths) {
					let oldPath = parentPaths[i];

					// Swap end of oldPath with the new path if the new path  points from root to obj.
					let start = oldPath.length - path.length;
					if (start >= 0) {

						// Create the newPath.
						let newPath = oldPath.slice();
						for (let j = start; j < oldPath.length; j++)
							newPath[j] = path[j - start];


						// See if newPath is a valid path from root to obj.
						let item = root;
						for (let field of newPath) {
							item = item[field];
							if (!item)
								break;
						}

						// Update the path.
						if (item === obj)
							parentPaths[i] = newPath;
					}
				}
			}
		}


		// Recurse through children to update their paths too.
		// This is testesd by the arrayShiftRecurse() test.
		if (Array.isArray(obj))
			for (let i=startIndex; i<obj.length; i++) {
				if (Array.isArray(obj[i]) || isObj(obj[i]))
					WatchUtil.rebuildArray(obj[i], 0, [...path, i+''], visited);
			}
		else if (isObj(obj))
			for (let i in obj)
				if (Array.isArray(obj[i]) || isObj(obj[i]))
					WatchUtil.rebuildArray(obj[i], 0, [...path, i+''], visited);
	},

	/**
	 * Get all roots that have paths to obj.
	 * @param obj
	 * @returns {Set.<Object>|Array} An iterable list. */
	getRoots: function(obj)	{
		obj = obj.$removeProxy || obj;
		return WatchUtil.roots.get(obj) || [];
	},

	/**
	 * Register a path from root to obj. */
	addPath: function(root, newPath, obj) {
		obj = obj.$removeProxy || obj;
		root = root.$removeProxy || root;

		// Add root from obj to path.
		let a = WatchUtil.roots.get(obj);
		if (!a)
			WatchUtil.roots.set(obj, a = new Set());
		a.add(root);

		// Get the map from object to paths.
		let objMap = WatchUtil.paths.get(root);
		if (!objMap)
			WatchUtil.paths.set(root, objMap=new WeakMap());

		// Get the paths
		let paths = objMap.get(obj);
		if (!paths)
			objMap.set(obj, [newPath]);

		// Add the path if it isn't already registered.
		// TODO: This could possibly be faster if the javascript Set could index by arrays.
		else {
			for (let existingPath of paths) {

				var l = existingPath.length;
				if (newPath.length < existingPath.length)
					continue;

				// If the new path begins with existingPath, don't add it.
				// Because now we're just expanding more paths from circular references.
				// Inline version of arrayEq() because it's faster.
				var same = true;
				for (let i=0; i<l; i++)
					if (same = !(existingPath[i] !== newPath[i]))
						break;
				if (same)
					return;
			}
			paths.push(newPath);
		}
	},

	/**
	 * Get all paths from root to obj. */
	getPaths: function(root, obj) {

		//#IFDEV
		if (root.$isProxy)
			throw new Error("Can't be proxy.");
		//#ENDIF
			
		// Get the map from object to paths.
		let objMap = WatchUtil.paths.get(root);
		if (!objMap)
			return [];

		// Get the paths
		return objMap.get(obj.$removeProxy || obj) || [];
	},


	addCallback: function(root, callback) {
		root = root.$removeProxy || root;

		let callbacks = WatchUtil.callbacks.get(root);
		if (!callbacks)
			WatchUtil.callbacks.set(root, callbacks=[]);
		callbacks.push(callback);
	},

	getCallbacks: function(root) {
		root = root.$removeProxy || root;
		return WatchUtil.callbacks.get(root) || [];
	},

	notifyCallbacks: function(root, action, path, newVal, oldVal) {
		let callbacks = WatchUtil.getCallbacks(root);
		for (let callback of callbacks)
			callback(action, path, newVal, oldVal);
	}
};

/** @type {WeakMap<object, Proxy>} Map from an object to the Proxy of itself. */
WatchUtil.proxies = new WeakMap();

/** @type {WeakMap<object, Set<object>>} A map from an object to all of its root objects. */
WatchUtil.roots = new WeakMap();


/** @type {WeakMap<object, function[]>} A map from roots to the callbacks that should be called when they're changed.. */
WatchUtil.callbacks = new WeakMap();

/**
 * A map of all paths from a root to an object.
 * Outer weakmap is indexed by root, inner by object.
 * @type {WeakMap<object, WeakMap<object, string[][]>>} */
WatchUtil.paths = new WeakMap();




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

	// Add a path from root to itself, so that when we call WatchUtil.getRoots() on a root, we get an empty path.
	WatchUtil.addPath(root, [], root);

	WatchUtil.addCallback(root, callback);
	return WatchUtil.getProxy(root);
};

