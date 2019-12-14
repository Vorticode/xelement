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

		// Don't allow setting proxies on underlying obj.
		// We need to remove them recursivly in case of something like newVal=[Proxy(obj)].

		var proxyObj = ProxyObject.get(obj);
		for (let root of proxyObj.roots) {
			if (field === 'length')
				continue;

			let path = [...proxyObj.getPath(root), field];

			obj[field] = removeProxies(newVal);
			root.callCallbacks('set', path, obj[field]);
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
			root.callCallbacks('delete', path);
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
}

class ProxyRoot {
	constructor(root) {

		/**
		 * Root element we're watching.
		 * @type object */
		this.root = root;

		/**
		 * Child objects
		 * @type {WeakMap<object, ProxyObject>} */
		this.objects = new WeakMap(); // map from obj to ProxyObj

		/**
		 * Functions to call when an object changes.
		 * @type {function[]} */
		this.callbacks = [];


		// Will this be used, or only the ProxyObject.proxy?
		//this.proxy = new Proxy(root, handler);

		// Add root to the ProxyObjects.
		this.getProxyObject(root);
	}

	callCallbacks(action, path, value) {
		for (let callback of this.callbacks)
			callback.apply(this.root, arguments);
	}

	/**
	 * Get or create.
	 * @param obj {object}
	 * @returns {ProxyObject} */
	getProxyObject(obj) {
		if (!this.objects.has(obj)) {
			var po = ProxyObject.get(obj);
			po.roots.add(this);
			this.objects.set(obj, po);
		}
		return this.objects.get(obj);
	};
}


/**
 * @type {WeakMap<object, ProxyRoot>} */
var proxyRoots = new WeakMap();

/**
 * @type {WeakMap<object, ProxyObject>} */
var proxyObjects = new WeakMap();  // Map from objects back to their roots.


/**
 * @param root {object}
 * @returns {ProxyRoot} */
ProxyRoot.get = function(root) {

	if (root.isProxy)
		root = root.removeProxy;

	if (!proxyRoots.has(root))
		proxyRoots.set(root, new ProxyRoot(root));
	return proxyRoots.get(root);
};

/**
 * @param obj {object}
 * @returns {ProxyObject} */
ProxyObject.get = function(obj, roots) {
	if (obj.isProxy)
		obj = obj.removeProxy;

	if (!proxyObjects.has(obj)) {
		proxyObjects.set(obj, new ProxyObject(obj, roots));

	}
	return proxyObjects.get(obj);
};


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








/**
 * Operates recursively to remove all proxies.  But should it?
 * @param obj {*}
 * @param visited {WeakSet=} Used internally.
 * @returns {*} */
var removeProxies = (obj, visited) => {
	if (obj === null || obj === undefined)
		return obj;

	while (obj.isProxy) // should never be more than 1 level deep of proxies.
		obj = obj.removeProxy;

	//#IFDEV
	if (obj.isProxy)
		throw new XElementError("Double wrapped proxy found.");
	//#ENDIF

	if (isObj(obj)) {
		if (!visited)
			visited = new WeakSet();
		else if (visited.has(obj))
			return obj;
		visited.add(obj);

		for (let name in obj)
			if (obj.hasOwnProperty(name)) { // Don't mess with inherited properties.  E.g. defining a new outerHTML.
				let t = obj[name];
				let v = removeProxies(t, visited);
				if (v !== t)
					watchlessSet(obj, [name],  v);
			}
	}
	return obj;
};

/**
 * Allow subcribing only to specific properties of an object.
 * Internally, the property is replaced with a call to Object.defineProperty() that forwards to
 * a proxy created by watchObh() above. */
class WatchProperties {

	constructor(obj) {
		this.obj_ = obj;   // Original object being watched.
		this.fields_ = {}; // removeProxy underlying fields that store the data.
		                   // This is necessary to store the values of obj_ after defineProperty() is called.
		this.proxy_ = watchObj(this.fields_, this.notify.bind(this));
		this.subs_ = {};
	}

	/**
	 * When a property or sub-property changes, notify its subscribers.
	 * @param action {string}
	 * @param path {string[]}
	 * @param value {*=} */
	notify(action, path, value) {

		// Traverse up the path looking for anything subscribed.
		var parentPath = path.slice(0, -1);
		while (parentPath.length) {
			let cpath = csv(parentPath); // TODO: This seems like a lot of work for any time a property is changed.

			if (cpath in this.subs_)
				for (let callback of this.subs_[cpath])
					callback.apply(this.obj_, arguments) // "this.obj_" so it has the context of the original object.
			parentPath.pop();
		}

		// Traverse to our current level and downward looking for anything subscribed
		let jpath = csv(path);
		for (let name in this.subs_)
			if (name.startsWith(jpath))
				for (let callback of this.subs_[name])
					callback.apply(this.obj_, arguments); // "this.obj_" so it has the context of the original object.
	}

	/**
	 *
	 * @param path {string|string[]}
	 * @param callback {function((action:string, path:string[], value:string?)} */
	subscribe(path, callback) {
		if (typeof path === 'string')
			path = parseVars(path)[0]; // TODO subscribe to all vars?

		// Create property at top level path, even if we're only watching something much deeper.
		// This way we don't have to worry about overriding properties created at deeper levels.
		var self = this;
		var field = path[0];
		if (!(field in self.fields_)) {
			self.fields_[field] = self.obj_[field];

			// If we're subscribing to something within the top-level field for the first time,
			// then define it as a property that forward's to the proxy.
			delete self.obj_[field];
			Object.defineProperty(self.obj_, field, {
				enumerable: 1,
				configurable: 1,
				get: () => {
					return self.proxy_[field];
				},
				set: (val) => {
					return self.proxy_[field] = val;
				}
			});
		}

		// Create the full path if it doesn't exist.
		traversePath(this.fields_, path, 1); // TODO: Do we have to create it?

		// Add to subscriptions
		let cpath = csv(path);
		if (!(cpath in self.subs_))
			self.subs_[cpath] = [];
		self.subs_[cpath].push(callback);
	}

	unsubscribe(path, callback) {

		// Make sure path is an array.
		if (typeof path === 'string')
			path = JSON.parse('[' + path + ']');

		// Remove the callback from this path and all parent paths.
		let cpath = csv(path);
		if (cpath in this.subs_) {

			// Remove the callback from the subscriptions
			if (callback) {
				let callbackIndex = this.subs_[cpath].indexOf(callback);
				this.subs_[cpath].splice(callbackIndex, 1); // splice() modifies array in-place
			}

			// Remove the whole subscription array if it's empty.
			if (!callback || !this.subs_[cpath].length)
				delete this.subs_[cpath];

			// Undo the Object.defineProperty() call when there are no more subscriptions to it.
			let propCpath = csv([path[0]]);
			if (!keysStartWith(this.subs_, propCpath).filter((x) => x.length).length) {

				delete this.obj_[path[0]]; // Remove the defined property.
				this.obj_[path[0]] = this.fields_[path[0]];

				delete this.fields_[path[0]];
			}
		}
	}
}


// Keeps track of which objects we're watching.
// That way watch() and unwatch() can work without adding any new fields to the objects they watch.
var watched = new WeakMap();

/**
 *
 * @param obj {object}
 * @param path {string|string[]}
 * @param callback {function(action:string, path:string[], value:string?)} */
var watch = (obj, path, callback) => {
	if (obj.isProxy)
		obj = obj.removeProxy;

	var wp;
	if (!watched.has(obj)) {
		wp = new WatchProperties(obj);
		watched.set(obj, wp);
	}
	else
		wp = watched.get(obj);

	wp.subscribe(path, callback);
};

/**
 *
 * @param obj {object}
 * @param path {string|string[]}
 * @param callback {function=} If not specified, all callbacks will be unsubscribed. */
var unwatch = (obj, path, callback) => {
	if (obj.isProxy)
		obj = obj.removeProxy;
	var wp = watched.get(obj);

	if (wp) {
		if (path)
			wp.unsubscribe(path, callback);
		else
			for (let sub in wp.subs_)
				wp.unsubscribe(sub);

		// Remove from watched objects if we're no longer watching
		if (!Object.keys(wp.subs_).length)
			watched.delete(obj);
	}
};

/**
 * This function is unused.
 * Get a property from a watched object, bypassing the proxy.
 * If the returned value is changed, no callbacks will be called.
 * @param obj {object}
 * @param path {string[]}
 * @returns {*} */
/*
function watchlessGet(obj, path) {
	let node = watched.get(obj).fields_;
	for (let p of path) {
		node = node[p];
		if (node.isProxy)
			throw new XElementError();
	}
	return node;
}
*/

var watchlessSet = (obj, path, val) => {
	// TODO: Make this work instead:
	// Or just use removeProxy prop?
	//traversePath(watched.get(obj).fields_, path, true, val);
	//return val;
	if (obj.isProxy)
		obj = obj.removeProxy;
	var wp = watched.get(obj);


	let node = wp ? wp.fields_ : obj;
	let prop = path.slice(-1)[0];
	for (let p of path.slice(0, -1)) {
		node = node[p];
		//#IFDEV
		// This can happen if one XElement subscribes within the path of another XElement via data-bind?
		//if (node.isProxy) // optional sanity check
		//	throw new XElementError('Variable ' + p + ' is already a proxy.');
		//#ENDIF

		if (node.isProxy)
			node = node.removeProxy;
	}

	return node[prop] = val;
};