
var removeProxy = (obj) => isObj(obj) ? obj.$removeProxy || obj : obj;


/**
 * Operates recursively to remove all proxies.  But should it?
 * @param obj {*}
 * @param visited {WeakSet=} Used internally.
 * @returns {*} */
var removeProxies = (obj, visited) => {
	if (obj === null || obj === undefined)
		return obj;

	if (obj.$isProxy) {
		obj = obj.$removeProxy;

		//#IFDEV
		if (obj.$isProxy) // If still a proxy.  There should never be more than 1 level deep of proxies.
			throw new XElementError("Double wrapped proxy found.");
		//#ENDIF
	}

	if (typeof obj === 'object') {
		if (!visited)
			visited = new WeakSet();
		else if (visited.has(obj))
			return obj; // visited this object before in a cyclic data structure.
		visited.add(obj);

		// Recursively remove proxies from every property of obj:
		for (let name in Object.keys(obj)) { // Don't mess with inherited properties.  E.g. defining a new outerHTML.
			let t = obj[name];
			let v = removeProxies(t, visited);

			// If a proxy was removed from something created with Object.defineOwnProperty()
			if (v !== t) {
				if (Object.getOwnPropertyDescriptor(obj, name).writable) // we never set writable=true when we defineProperty.
					obj[name] = v;
				else {
					// It's a defined property.  Set it on the underlying object.
					let wp = watched.get(obj);
					let node = wp ? wp.fields_ : obj;
					node[name] = v
				}
			}
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
		this.fields_ = {}; // $removeProxy underlying fields that store the data.
		                   // This is necessary to store the values of obj_ after defineProperty() is called.
		this.proxy_ = watchProxy(this.fields_, this.notify_.bind(this));

		/** @type {object<string, function>} A map from a path to the callback subscribed to that path. */
		this.subs_ = {};
	}

	/**
	 * When a property or sub-property changes, notify its subscribers.
	 * This is an expanded version of watchproxy.notify.  It also notifies every callback subscribed to a parent of path,
	 * and all children of path if their own value changed.
	 * @param action {string}
	 * @param path {string[]}
	 * @param value {*=}
	 * @param oldVal {*=} */
	notify_(action, path, value, oldVal) {

		if (action === 'info')
			return this.subs_;

		let cpath = csv(path);

		// Traverse up the path looking for anything subscribed.
		let parentPath = path.slice(0, -1);
		while (parentPath.length) {
			let parentCPath = csv(parentPath); // TODO: This seems like a lot of work for any time a property is changed.

			if (parentCPath in this.subs_)
				for (let callback of this.subs_[parentCPath])
					// "this.obj_" so it has the context of the original object.
					// We set indirect to true, which data-loop's rebuildChildren() uses to know it doesn't need to do anything.
					callback.apply(this.obj_, [...arguments, true])
			parentPath.pop();
		}

		// Notify at the current level:
		if (cpath in this.subs_)
			for (let callback of this.subs_[cpath])
				callback.apply(this.obj_, arguments);

		// Traverse to our current level and downward looking for anything subscribed
		let newVal = traversePath(this.obj_, path);
		for (let name in this.subs_)
			if (name.startsWith(cpath) && name.length > cpath.length) {
				let subPath = name.slice(cpath.length > 0 ? cpath.length + 1 : cpath.length); // +1 for ','
				let oldSubPath = JSON.parse('[' + subPath + ']');

				let fullSubPath = JSON.parse('[' + name + ']');

				let oldSubVal = removeProxy(traversePath(oldVal, oldSubPath));
				let newSubVal = removeProxy(traversePath(newVal, oldSubPath));


				if (oldSubVal !== newSubVal)
					for (let callback of this.subs_[name])
						callback.apply(this.obj_, [action, fullSubPath, newSubVal, oldSubVal]); // "this.obj_" so it has the context of the original object.
			}
	}

	/**
	 *
	 * @param path {string|string[]}
	 * @param callback {function(action:string, path:string[], value:string?)} */
	subscribe_(path, callback) {
		if (path.startsWith) // is string
			path = [path];

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
				get: () => self.proxy_[field],
				//set: (val) => self.obj_.$disableWatch ? self.proxy_.$removeProxy[field] = val : self.proxy_[field] = val
				set: function(val) {
					if (self.obj_.$disableWatch) // used by traversePath to watchlessly set.
						self.proxy_.$removeProxy[field] = val;
					else
						self.proxy_[field] = val;
				}
			});
		}


		// Create the full path if it doesn't exist.
		// TODO: Can this part be removed?
		traversePath(this.fields_, path, 1);


		// Add to subscriptions
		let cpath = csv(path);
		if (!(cpath in self.subs_))
			self.subs_[cpath] = [];
		self.subs_[cpath].push(callback);
	}

	/**
	 *
	 * @param path{string[]|string}
	 * @param {function?} callback Unsubscribe this callback.  If not specified, all callbacks willb e unsubscribed. */
	unsubscribe_(path, callback) {

		// Make sure path is an array.
		if (path.startsWith) // is string
			path = [path];

		// Remove the callback from this path and all parent paths.
		let cpath = csv(path);
		if (cpath in this.subs_) {

			// Remove the callback from the subscriptions
			if (callback) {
				let callbackIndex = this.subs_[cpath].indexOf(callback);
				//#IFDEV
				if (callbackIndex === -1)
					throw new XElementError('Bad index');
				//#ENDIF
				this.subs_[cpath].splice(callbackIndex, 1); // splice() modifies array in-place
			}

			// If removing all callbacks, or if all callbacks have been removed:
			if (!callback || !this.subs_[cpath].length) {

				// Remove the whole subscription array if there's no more callbacks
				delete this.subs_[cpath];

				// Undo the Object.defineProperty() call when there are no more subscriptions to it.
				// If there are no subscriptions that start with propCPath
				// TODO This can be VERY SLOW when an object has many subscribers.  Such as an x-loop with hundreds of children.
				// If the loop tries to remove every child at once the complexity is O(n^2) because each child must search every key in this.subs_.
				// We need to find a faster way.
				let propCpath = csv([path[0]]);
				if (!hasKeyStartingWith(this.subs_, propCpath)) {

					delete this.obj_[path[0]]; // Remove the defined property.
					this.obj_[path[0]] = this.fields_[path[0]]; // reset original unproxied value to object.

					delete this.fields_[path[0]];
				}
			}
		}
	}
}

/**
 * Keeps track of which objects we're watching.
 * That way watch() and unwatch() can work without adding any new fields to the objects they watch.
 * @type {WeakMap<object, WatchProperties>} */
var watched = new WeakMap();

/**
 *
 * @param obj {object}
 * @param path {string|string[]}
 * @param callback {function(action:string, path:string[], value:string?)} */
var watch = (obj, path, callback) => {
	obj = removeProxy(obj);

	// Keep only one WatchProperties per watched object.
	var wp = watched.get(obj);
	if (!wp)
		watched.set(obj, wp = new WatchProperties(obj));

	wp.subscribe_(path, callback);
};

/**
 *
 * @param obj {object}
 * @param path {string|string[]}
 * @param callback {function=} If not specified, all callbacks will be unsubscribed. */
var unwatch = (obj, path, callback) => {
	obj = removeProxy(obj);
	var wp = watched.get(obj);

	if (wp) {
		if (path) // unsubscribe only from path.
			wp.unsubscribe_(path, callback);
		else // unsubscribe rom all paths.
			for (let sub in wp.subs_)
				wp.unsubscribe_(sub);

		// Remove from watched objects if we're no longer watching
		if (!Object.keys(wp.subs_).length)
			watched.delete(obj);
	}
};


// Exports
window.watch = watch;
window.unwatch = unwatch;
