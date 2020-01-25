//#IFDEV
class XElementError extends Error {
	constructor(msg) {
		super(msg);
	}
}
//#ENDIF

/**
 * Return true if the two arrays have the same items in the same order.
 * @param array1 {*[]}
 * @param array2 {*[]}
 * @returns {boolean} */
var arrayEq = (array1, array2, deep) => {
	if (array1.length !== array2.length)
		return false;

	array2 = array2.$removeProxy || array2;
	return (array1.$removeProxy || array1).every((value, index) => {
		if (deep && Array.isArray(value))
			return arrayEq(value, array2[index]);
		return eq(value, array2[index]);
	})
};

var eq = (item1, item2) => {
	return (item1.$removeProxy || item1) === (item2.$removeProxy || item2);
};


var WeakMultiMap = function() {

	let self = this;
	self.items = new WeakMap();

	/**
	 * Add an item to the map.  If it already exists, add another at the same key.
	 * @param key
	 * @param value */
	self.add = function(key, value) {
		let itemSet = self.items.get(key);
		if (!itemSet)
			self.items.set(key, [value]);
		else
			itemSet.push(value);
	};

	/**
	 * Retrieve an item from the set that matches key and all values specified.
	 * @param key
	 * @returns {*|undefined} */
	self.get = function(key) {
		return self.items.get(key)[0];
	};

	self.getAll = function(key) {
		return self.items.get(key) || [];
	};

	// remove last item added.
	self.remove = function(key) {
		let itemSet = self.items.get(key);
		if (!itemSet)
			return undefined;
		if (itemSet.length === 1) // remove on last item
			self.items.delete(key);
		return itemSet.pop();
	};

	self.removeAll = function(key) {
		return self.items.delete(key);
	}

};


// Multi key lookup version.  Might not need this added complexity.
// var WeakMultiMap2 = function() {
//
// 	let self = this;
// 	self.items = new WeakMap();
//
// 	// TODO: write an internal function that combines common elements of these functions
//
//
// 	/**
// 	 * Add an item to the map.  If it already exists, add another at the same key.
// 	 * @param key
// 	 * @param values */
// 	self.add = function(key, ...values) {
// 		let itemSet = self.items.get(key);
// 		if (!itemSet)
// 			self.items.set(key, [values]);
// 		else
// 			itemSet.push(values);
// 	};
//
// 	/**
// 	 * Retrieve an item from the set that matches key and all values specified.
// 	 * @param key
// 	 * @param values
// 	 * @returns {*|undefined} */
// 	self.get = function(key, ...values) {
// 		let itemSet = self.items.get(key);
// 		if (itemSet) {
// 			for (let item of itemSet) {
// 				if (arrayEq(item.slice(0, values.length), values, true))
// 					return item;
// 			}
// 		}
// 		return undefined;
// 	};
//
// 	self.getAll = function(key, ...values) {
// 		let result = [];
// 		let itemSet = self.items.get(key);
// 		if (itemSet) {
// 			for (let item of itemSet) {
// 				let matches = true;
// 				for (let i = 0; i < values.length; i++) {
// 					if (!eq(item[i], values[i])) {
// 						matches = false;
// 						break;
// 					}
// 				}
//
// 				// Return the first item in the array that matches.
// 				if (matches)
// 					result.push(item);
// 			}
// 		}
//
//
// 		return result;
// 	};
//
// 	// remove first match
// 	self.remove = function(key, ...values) {
// 		let itemSet = self.items.get(key);
// 		if (itemSet) {
// 			for (let j=0; j<itemSet.length; j++) {
// 				let item = itemSet[j];
// 				let matches = true;
// 				for (var i = 0; i < values.length; i++) {
// 					if (!eq(item[i], values[i])) {
// 						matches = false;
// 						break;
// 					}
// 				}
//
// 				// Return the first item in the array that matches.
// 				if (matches) {
// 					itemSet.splice(j, 1);
// 					return item;
// 				}
// 			}
// 		}
// 		return undefined;
// 	};
//
// };



var createEl = (html) => {
	//#IFDEV
	if (typeof html !== 'string')
		throw new XElementError('Html argument must be a string.');
	//#ENDIF

	var div = document.createElement('div');
	div.innerHTML = html;

	//  TODO: skip whitespace, comments
	return div.removeChild(div.firstChild);
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
 * @returns {Array} */
var keysStartWith = (obj, prefix) => {

	var result = [];
	for (let key in obj)
		if (key.startsWith(prefix))
			result.push(obj[key]);
	return result;
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
 * Shortened version of this answer: stackoverflow.com/a/18751951
 * @type {string[]} */
var eventNames = Object.keys(document.__proto__.__proto__)
	.filter((x) => x.startsWith('on'))
	.map(   (x) => x.slice(2));


var Cache = function() {
	var self = this;
	this.map = new Map();

	this.get = function(key, val) {
		let result = self.map.get(key);
		if (!result) {
			self.map.set(key, result = val());
		}
		return result;
	};

	this.remove = function(key) {
		// TODO
	};
};

var safeEvalCache = new Cache();


/**
 * Evaluate expr, but allow undefined variables.
 * @param expr {string}
 * @param args {object}
 * @returns {*} */
function safeEval(expr, args, statements) {

	let code = statements ? expr : 'return (' + expr + ')';
	if (args && Object.keys(args).length) {

		// Convert args object to var a=arguments[0][name] assignments
		let argAssignments = [];
		for (let name in args)
			argAssignments.push(name + '=arguments[0]["' + name.replace(/"/g, '\"') + '"]');

		code = 'var ' + argAssignments.join(',') + ';' + code;
	}

	console.log(code);

	try {
		//return Function('return (' + expr + ')').call(this);
		let lazyEval = function() {
			return Function(code);
		};
		return safeEvalCache.get(code, lazyEval).call(this, args);
	}
	catch (e) { // Don't fail for null values.
		if (!(e instanceof TypeError) || (!e.message.match('undefined'))) {
			//#IFDEV
				e.message += ' in expression "' + code + '"';
			//#ENDIF
			throw e;
		}
	}
	return undefined;
}

