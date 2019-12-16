

/**
 * Operates recursively to remove all proxies.  But should it?
 * @param obj {*}
 * @param visited {WeakSet=} Used internally.
 * @returns {*} */
var removeProxies = (obj, visited) => {
	if (obj === null || obj === undefined)
		return obj;

	while (obj.$isProxy) // should never be more than 1 level deep of proxies.
		obj = obj.$removeProxy;

	//#IFDEV
	if (obj.$isProxy)
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
					// obj.$removeProxy[name] = v;  This should let us remove watchlessSet, but it doesn't work.
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
		this.subs_ = {};
	}

	/**
	 * When a property or sub-property changes, notify its subscribers.
	 * @param action {string}
	 * @param path {string[]}
	 * @param value {*=} */
	notify_(action, path, value) {

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
	subscribe_(path, callback) {
		if (typeof path === 'string')
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
				set: (val) => self.proxy_[field] = val
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

	unsubscribe_(path, callback) {

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
	obj = obj.$removeProxy || obj;

	// Keep only one WatchProperties per watched object.
	var wp;
	if (!watched.has(obj)) {
		wp = new WatchProperties(obj);
		watched.set(obj, wp);
	}
	else
		wp = watched.get(obj);

	wp.subscribe_(path, callback);
};

/**
 *
 * @param obj {object}
 * @param path {string|string[]}
 * @param callback {function=} If not specified, all callbacks will be unsubscribed. */
var unwatch = (obj, path, callback) => {
	obj = obj.$removeProxy || obj;
	var wp = watched.get(obj);

	if (wp) {
		if (path)
			wp.unsubscribe_(path, callback);
		else
			for (let sub in wp.subs_)
				wp.unsubscribe_(sub);

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
		if (node.$isProxy)
			throw new XElementError();
	}
	return node;
}
*/

var watchlessSet = (obj, path, val) => {
	// TODO: Make this work instead:
	// Or just use $removeProxy prop?
	//traversePath(watched.get(obj).fields_, path, true, val);
	//return val;
	obj = obj.$removeProxy || obj;
	var wp = watched.get(obj);


	let node = wp ? wp.fields_ : obj;
	let prop = path.slice(-1)[0];
	for (let p of path.slice(0, -1)) {
		node = node[p];
		//#IFDEV
		// This can happen if one XElement subscribes within the path of another XElement via data-bind?
		//if (node.$isProxy) // optional sanity check
		//	throw new XElementError('Variable ' + p + ' is already a proxy.');
		//#ENDIF

		node = node.$removeProxy || node;
	}

	return node[prop] = val;
};