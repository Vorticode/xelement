/**
 * Create a copy of root, where callback() is called whenever anything within object is added, removed, or modified.
 * Monitors all deeply nested properties including array operations.
 * Inspired by: stackoverflow.com/q/41299642
 * @param root {object}
 * @param callback {function(action:string, path:string[], value:string?)} Action is 'set' or 'delete'.
 * @returns {Proxy} */
function watchObj(root, callback) {

	// A map between objects and their string[] path.
	// This is passed to callback whenever a prop changes so we know what changed.
	var paths = new WeakMap();
	paths.set(root, []);

	var handler = {
		/**
		 * Overridden to wrap returned values in a Proxy, so we can see when they're changed.
		 * And to keep track of the path as we traverse deeper into an object.
		 * @param obj {Array|object}
		 * @param field {string} An object key or array index.
		 * @returns {*} */
		get(obj, field) {
			if (field==='isProxy')
				return true;
			if (field==='unProxied')
				return obj;

			var result = obj[field];
			if (typeof result === 'object' && result !== null) {

				// Keep track of paths.
				// Paths are built recursively as we descend, by getting the parent path and adding the new field.
				if (!paths.has(result))
					paths.set(result, [...paths.get(obj), field]);

				// If setting the value to an object or array, also create a proxy around that one.
				if (result.isProxy)
					return result; // TODO: Will this break having multiple proxies per object?
				return new Proxy(result, handler);
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

			// Don't nest proxies.
			while (newVal.isProxy)
				newVal = newVal.unProxied;

			var path = [...paths.get(obj), field];
			//console.log('set', path, newVal);
			if (field === 'length') { // Convert length changes to delete.  spice() will set length.
				// var oldLength = obj.length;
				// obj.length = newVal;
				// for (let i=oldLength; i<newVal; i++)
				// 	callback('delete', path);
			}
			else
				callback('set', path, obj[field] = newVal);
			return true;
		},

		/**
		 * Trap called whenever anything in an array or object is deleted.
		 * @param obj {Array|object} root or an object within root that we're deleting a property on.
		 * @param field {int|string} An object key or array index.
		 * @returns {boolean} */
		deleteProperty(obj, field) {
			//console.log('delete', [...paths.get(obj)], field);

			if (Array.isArray(obj))
				obj.splice(field, 1);
			else
				delete obj[field];
			callback('delete', [...paths.get(obj), field]);
			return true;
		}
	};

	return new Proxy(root, handler);
}

function keysStartWith(obj, prefix) {
	var result = [];
	for (let key in obj)
		if (key.startsWith(prefix))
			result.push(obj[key]);
	return result;
}


/**
 * Allow subcribing only to specific properties of an object.
 * Internally, the property is replaced with a call to Object.defineProperty() that forwards to
 * a proxy created by watchObh() above. */
class WatchProperties {

	constructor(obj) {
		this.obj_ = obj;   // Original object being watched.
		this.fields_ = {}; // Unproxied underlying fields that store the data.
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
		var path2 = path.slice(0, -1);
		while (path2.length) {
			let jpath = csv(path2); // TODO: This seems like a lot of work for any time a property is changed.

			if (jpath in this.subs_)
				for (let callback of this.subs_[jpath])
					callback.apply(this.obj_, arguments) // "this.obj_" so it has the context of the original object.
			path2.pop();
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
		// This way we don't have to worry about overriding properties created at deper levels.
		var self = this;
		var field = path[0];
		if (!(field in self.fields_)) {

			// Set initial value from obj, creating the path to it.
			let initialValue = traversePath(this.obj_, path);
			if (initialValue && initialValue.isProxy) // optional check
				throw new Error();

			traversePath(this.fields_, path, true, initialValue);

			// If we're subscribing to something within the top-level field for the first time,
			// then define it as a property that forward's to the proxy.
			Object.defineProperty(self.obj_, field, {
				enumerable: true,
				configurable: true,
				get: () => {
					return self.proxy_[field];
				},
				set: (val) => {
					return self.proxy_[field] = val;
				}
			});
		}


		// Append to subscriptions.
		// var jpath = csv(path);
		// if (!(jpath in self.subs))
		// 	self.subs[jpath] = [];
		// self.subs[jpath].push(callback);

		// Add the callback to this path and all parent paths.
		var path2 = path.slice();  // shallow copy
		//while(path2.length) {

			let jpath = csv(path2);
			if (!(jpath in self.subs_))
				self.subs_[jpath] = [];
			self.subs_[jpath].push(callback);

		//	path2.pop();
		//}

	}

	unsubscribe(path, callback) {

		// Make sure path is an array.
		if (typeof path === 'string')
			path = parseVars(path)[0];

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

				delete this.obj_[path[0]];
				this.obj_[path[0]] = this.fields_[path[0]];
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
function watch(obj, path, callback) {
	var wp;
	if (!watched.has(obj)) {
		wp = new WatchProperties(obj);
		watched.set(obj, wp);
	}
	else
		wp = watched.get(obj);

	wp.subscribe(path, callback);
}

/**
 *
 * @param obj {object}
 * @param path {string|string[]}
 * @param callback {function=} If not specified, all callbacks will be unsubscribed. */
function unwatch(obj, path, callback) {
	var wp = watched.get(obj);

	if (wp) {
		wp.unsubscribe(path, callback);

		// Remove from watched objects if we're no longer watching
		if (!Object.keys(wp.subs_).length)
			watched.delete(obj);
	}
}

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
			throw new Error();
	}
	return node;
}
*/

function watchlessSet(obj, path, val) {
	// TODO: Make this work instead:
	//traversePath(watched.get(obj).fields_, path, true, val);
	//return val;

	let node =  watched.get(obj).fields_;
	let prop = path.slice(-1)[0];
	for (let p of path.slice(0, -1)) {
		node = node[p];
		if (node.isProxy) /// optional sanity check
			throw new Error();
	}

	return node[prop] = val;
}