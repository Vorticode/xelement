/**
 * Shortened version of this answer: stackoverflow.com/a/18751951
 * @type {string[]} */
var eventNames = Object.keys(document.__proto__.__proto__)
	.filter((x) => x.startsWith('on'))
	.map(   (x) => x.slice(2));
var eventNamesMap = {};
for (let eventName of eventNames)
	eventNamesMap['on'+eventName] = true;


//#IFDEV
class XElementError extends Error {
	constructor(msg) {
		super(msg);
	}
}
//#ENDIF


var removeProxy = (obj) => (obj && obj.$removeProxy) || obj;

/**
 * Return true if the two arrays have the same items in the same order.
 * @param array1 {*[]}
 * @param array2 {*[]}
 * @param deep {boolean=false}
 * @returns {boolean} */
var arrayEq = (array1, array2, deep) => {
	if (!array1 || !array2 || array1.length !== array2.length)
		return false;

	array2 = removeProxy(array2);
	return removeProxy(array1).every((value, index) => {
		if (deep && Array.isArray(value))
			return arrayEq(value, array2[index]);

		return removeProxy(value) === removeProxy(array2[index])
	})
};


/**
 * Returns true if obj has at least one key defined.
 * @param {object} obj
 * @returns {boolean} */
var hasKeys = (obj) => {
	for (let item in obj)
		return true;
	return false;
};



/**
 * Return the array as a quoted csv string.
 * @param array {string[]}
 * @returns {string} */
var csv = (array) => JSON.stringify(array).slice(1, -1); // slice() to remove starting and ending [].


/**
 * @param obj {*}
 * @returns {boolean} */
var isObj = (obj) => obj && typeof obj === 'object'; // Make sure it's not null, since typof null === 'object'.

/**
 * Is name a valid attribute for el.
 * @param el {HTMLElement}
 * @param name {string}
 * @returns {boolean} */
var isValidAttribute = (el, name) => {
	if ((name.startsWith('data-') || name.startsWith('x-') ||el.hasAttribute(name)) ||
		(name.startsWith('on') && eventNames.includes(name.slice(2))))
		return true;

	if (name in el)
		return false;

	// Try setting the prop to see if it creates an attribute.
	el[name] = 1;
	var isAttr = el.hasAttribute(name);
	delete el[name];
	return isAttr;
};

/**
 * Find object values by keys that start with prefix.
 * @param obj {object}
 * @param prefix {string}
 * @returns {boolean} */
var hasKeyStartingWith = (obj, prefix) => {
	for (let key in obj)
		if (key.startsWith(prefix))
			return true;
	return false;
};

/**
 * @param el {HTMLElement}
 * @returns {int} */
//var parentIndex = (el) => !el.parentNode ? 0 : Array.prototype.indexOf.call(el.parentNode.children, el);

/**
 * @param obj {object}
 * @param path {string[]}
 * @param create {boolean=false} Create the path if it doesn't exist.
 * @param value {*=} If not undefined, set the object's path field to this value.
 * @param watchless {boolean=false} If true, the value will be set without triggering any watch notifications. */
var traversePath = (obj, path, create, value, watchless) => {
	if (!obj && !create && path.length)
		return undefined;

	let i = 0;
	for (let srcProp of path) {
		let last = i === path.length-1;

		// If the path is undefined and we're not to the end yet:
		if (obj[srcProp] === undefined) {

			// If the next index is an integer or integer string.
			if (create) {

				if (!last) {
					// If next level path is a number, create as an array
					if ((path[i + 1] + '').match(/^\d+$/))
						obj[srcProp] = [];
					else
						obj[srcProp] = {};
				}
			}
			else
				return undefined; // can't traverse
		}

		// If last item in path
		if (last && value !== undefined) {
			if (watchless) {
				obj = obj.$removeProxy || obj;
				obj.$disableWatch = true; // sometimes this causes stack overflow?  Perhaps I need to use Object.getOwnPropertyDescriptor() to see if it's a prop?
			}

			obj[srcProp] = value;
			if (watchless)
				delete obj.$disableWatch;
		}

		// Traverse deeper along destination object.
		obj = obj[srcProp];
		i++;
	}

	return obj;
};



/**
 * Operates recursively to remove all proxies.
 * TODO: This is used by watchproxy and should be moved there?
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
					let wp = watch.objects.get(obj);
					let node = wp ? wp.fields_ : obj;
					node[name] = v
				}
			}
		}
	}
	return obj;
};
export { arrayEq, hasKeys, csv, isObj, isValidAttribute, hasKeyStartingWith, traversePath, eventNamesMap, XElementError };
export {removeProxy, removeProxies};