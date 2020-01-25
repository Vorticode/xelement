// https://github.com/Vorticode/xelement
(function() {
//%replace%
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
 * @returns {*} */
function safeEval(expr) {
	try {
		//return Function('return (' + expr + ')').call(this);
		let lazyEval = function() {
			return Function('return (' + expr + ')');
		};
		return safeEvalCache.get(expr, lazyEval).call(this);
	}
	catch (e) { // Don't fail for null values.
		if (!(e instanceof TypeError) || (!e.message.match('undefined'))) {
			//#IFDEV
				e.message += ' in expression "' + expr + '"';
			//#ENDIF
			throw e;
		}
	}
	return undefined;
}

;

// Regex for matching javascript variables.  Made from pieces of this regex:  https://www.regexpal.com/?fam=112426
var identifier = '([$a-z_][$a-z0-9_]*)';       // A regular variable name.
var dotIdentifier = '\\.\\s*' + identifier;
var varBrD = '\\[\\s*"(([^"]|\\")*)"\\s*]';  // A ["as\"df"] index
var varBrS = varBrD.replace(/"/g, "'");      // A ['as\'df'] index
var varNum = "\\[\\s*(\\d+)\\s*]";           // A [3] index (numerical)

var or = '\\s*|\\s*';
var varProp = dotIdentifier + or + varBrD + or + varBrS + or + varNum;

var or2 = '\\s*\\(?|^\\s*';
var varPropOrFunc = '^\\s*' + dotIdentifier + or2 + varBrD + or2 + varBrS + or2 + varNum + '\\s*\\(?';

var isStandaloneVarRegex = new RegExp('^' + identifier + '(' + varProp + ')*$', 'i');
var isSimpleCallRegex = new RegExp('^' + identifier + '(' + varProp + ')*\\(', 'i');
var varStartRegex = new RegExp(identifier, 'gi');
var varPropRegex  = new RegExp(varPropOrFunc, 'gi');

// https://mathiasbynens.be/notes/javascript-identifiers
// We exclude 'let,package,interface,implements,private,protected,public,static,yield' because testing shows Chrome accepts these as valid var names.
var nonVars = 'length,NaN,Infinity,caller,callee,prototype,arguments,true,false,null,undefined,break,case,catch,continue,debugger,default,delete,do,else,finally,for,function,if,in,instanceof,new,return,switch,throw,try,typeof,var,void,while,with,class,const,enum,export,extends,import,super'.split(/,/g);

var isStandaloneVar = (code) => {
	return !!code.trim().match(isStandaloneVarRegex);
};
var isStandaloneCall = (code) => {
	// if it starts with a variable followed by ( and has no more than one semicolon.
	code = code.trim();

	// If there's a semicolon other than at the end.
	// TODO: This doesn't account for if there's a semicolon in a string argument to the function.
	var semi = code.indexOf(';');
	if (semi !== -1 && semi !== code.length-1)
		return false;

	return !!code.match(isSimpleCallRegex);
};

/**
 * Take a string of code and parse out all JavaScript variable names,
 * ignoring function calls "name(" and anything in nonVars that's not inside [''].
 * @param code {string}
 * @param includeThis {boolean=false} Include "this." when parsing variables.
 * @param allowCall {boolean=false}
 * @returns {string[][]} An array of paths, where a path is all sub-properties of a variable name.
 * @example
 *     parseVars('this.person.firstName.substr()', true) // returns [['this', 'person', 'firstName']]
 *     parseVars('var a = b["c"]') // returns [['a'], ['b', 'c']] */
var parseVars = (code, includeThis, allowCall) => {
	//code = code.trim(); // Breaks indices.
	var result = [];
	var index = 0;

	while (code.length) {
		let regex = varStartRegex; // Reset for looking for start of a variable.
		let keepGoing = 1;
		let currentVar = [], matches;
		currentVar.index_ = []; // track the index of each match within code.
		while (keepGoing && code.length && !!(matches = regex.exec(code))) {

			// Add the start of the match.
			index += matches.index;


			code = code.slice(regex.lastIndex); // advance forward in parsing code.
			regex.lastIndex = 0; // reset the regex.

			// Don't grab functions or common functions properties as vars unless they are within brackets.
			// matches[1] is the match for a .variable and not something in brackets.
			// TODO: allow some nonvars if in brackets?
			keepGoing = (allowCall || !matches[0].endsWith('(')) && !nonVars.includes(matches[1]);
			if (keepGoing) {

				// fitler() removes undefineds from matches.
				// This lets us get the first non-undefiend parenthetical submatch.
				let item = matches.filter(Boolean)[1];

				// Add varible property to current path
				if (includeThis || item !== 'this') {
					currentVar.push(item);
					currentVar.index_.push({
						start: index,
						end: index+item.length
					});
				}

				regex = varPropRegex; // switch to reading subsequent parts of the variable.
			}

			// Add the length of the match.
			index += matches[0].length;
		}

		// Start parsing a new variable.
		index += regex.lastIndex;
		regex.lastIndex = 0; // reset the regex.
		if (currentVar.length)
			result.push(currentVar);
		else
			break;
	}

	return result;
};

var replaceVarsOld = (code, replacements) => {
	var paths = parseVars(code, 1);
	for (let path of paths.reverse()) // We loop in reverse so the replacement indices don't get messed up.
		for (let oldVar in replacements) {
			if (path.length >= 1 && path[0] === oldVar)
				// replacements[oldVar] is newVar.
				code = code.slice(0, path.index_[0].start) + replacements[oldVar] + code.slice(path.index_[0].start + oldVar.length);
		}
	return code;
};

// TODO: actual parsing.
var trimThis = function(code) {
	return code.replace(/^this\./, '');
};

/**
 * TODO: this function should leave alone anything after a :
 *
 * If a replacement value is "this", it'll be trimmed off the beginning.
 * @param code {string}
 * @param replacements {object<string, string>}
 * @returns {string} */
var replaceVars = (code, replacements) => {
	if (!Array.isArray(replacements))
		replacements = [replacements];

	for (let replacement of replacements)
		for (let oldVar in replacement) {
			var paths = parseVars(code, 1);
			for (let path of paths.reverse()) { // We loop in reverse so the replacement indices don't get messed up.

				if (path.length >= 1 && path[0] === oldVar) {
					let newVal = replacement[oldVar];
					if (newVal === 'this')
						code = path[1] + (path.length > 2 ? code.slice(path.index_[2].start) : '');
					else
						code = code.slice(0, path.index_[0].start) + replacement[oldVar] + code.slice(path.index_[0].end);
				}
			}
		}
	return code;
};

/**
 * TODO: Could this be replaced with:
 * result = eval('{' + code + '}');
 * No, because sometimes the value needs this. prepended.  Or the properties are undefined.
 *
 * TODO: This will fail if code has ";" inside strings.
 * each key is in the format name: expr
 * @param code
 * @returns {object<string, string>} */
var parseObj = (code) => {
	//return eval('{' + code + '}');

	let result = {};
	let pieces = code.split(/\s*;\s*/); // splitting on comma will divide objects.  TODO, need to support a real parser.  JSON won't understand var names.  eval() will evaluate them.
	for (let piece of pieces) {
		var colon = piece.indexOf(':');
		let key = piece.slice(0, colon).trim();
		result[key] = piece.slice(colon+1).trim();

		//let [key, value] = piece.split(/\s*:\s*/); // this splits more than once.
		//result[key] = value;
	}
	return result;
};

/*
var joinObj = (obj) => {
	var result = [];
	for (let name in obj)
		result.push (name + ':' + obj[name]);
	return result.join(';');
};
*/

/**
 * Parse "items : item" into two part, always splitting on the last colon.
 * @param code {string}
 * @return {[string, string, string]} foreachCode, loopVar, indexVar (optional) */
var parseLoop = (code) => {
	var result = code.split(/[,:](?=[^:]+$)/).map((x)=>x.trim());
	if (result[2])
		result = [result[0], result[2], result[1]]; // swap elements 1 and 2, so indexVar is last.

	//#IFDEV
	if (!isStandaloneVar(result[1]))
		throw new XElementError('Could not parse loop variable in data-loop attribute "' + code + '".');
	if (result[2] && !isStandaloneVar(result[2]))
		throw new XElementError('Invalid index variable in data-loop attribute "' + code + '".');
	if (result.length > 3)
		throw new XElementError('Could not parse data-loop attribute "' + code + '".');
	//#ENDIF

	return result;

	/*
	// Parse code into foreach parts.
	var colon = code.lastIndexOf(':');
	if (colon < 0) // -1
		throw new XElementError('data-loop attribute "' + code + '" missing colon.');
	var result = [code.slice(0, colon)];       // foreach part
	var loopVar = code.slice(colon+1).trim(); // loop var
	var comma = loopVar.indexOf(',');
	if (comma >= 0) { // If index.
		result.push(loopVar.slice(0, comma).trim());
		result.push((loopVar.slice(comma+1).trim()));
	}
	else
		result.push(loopVar)

	return result;
	*/
};

/**
 * Add a "this." prefix to code where we can.
 * @param code  {string}
 * @param context {object<string, string>}
 * @param isStandalone {function(string):boolean=} A function to detect whether the code is a stanadlone var.
 * @param prefix {string=} Defaults to "this"
 * @returns {string} */
var addThis = (code, context, isStandalone, prefix) => {
	if (Array.isArray(context))
		context = context[0]; // TODO: Instead of this hack, we need to handle context as an array.

	prefix = prefix || 'this';
	isStandalone = isStandalone || isStandaloneVar;
	if (!isStandalone(code))
		return code;

	// If it starts with this or an item in context, do nothing.
	code = code.trim();
	for (let pre of [prefix, ...Object.keys(context || {})])
		if (code.match(new RegExp('^' + pre + '(\s*[\.[]|$)'))) // starts with "prefix." or "prefix["
			return code;

	return prefix + '.' + code;
};;

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
			return ProxyObject.get_(obj).roots_;
		if (field==='$trigger') {
			let proxyObj = ProxyObject.get_(obj);
			for (let root of proxyObj.roots_)
				root.notify_('set', [], obj);
			return proxyObj.roots_;
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

			//if (obj[field] !== newVal) {
				let oldVal = obj[field];

				// TODO: This can trigger notification if field was created on obj by defineOwnProperty()!
				obj[field] = newVal;

				let path = [...proxyObj.getPath_(root), field];

				root.notify_('set', path, obj[field], oldVal);
			//}
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

							// Trigger a single notfication change.
							//self.proxy_.length = self.proxy_.length + 0;
							self.proxy_.$trigger;

							return result;
						}
					}
				});


		}
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
};;


var removeProxy = (obj) => {
	if (isObj(obj))
		return obj.$removeProxy || obj;
	return obj;
};



/**
 * Operates recursively to remove all proxies.  But should it?
 * @param obj {*}
 * @param visited {WeakSet=} Used internally.
 * @returns {*} */
var removeProxies = (obj, visited) => {
	if (obj === null || obj === undefined)
		return obj;

	if (obj.$isProxy)
		obj = obj.$removeProxy;

	//#IFDEV
	if (obj.$isProxy) // should never be more than 1 level deep of proxies.
		throw new XElementError("Double wrapped proxy found.");
	//#ENDIF

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

			// If a proxy was removed from the property.
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
	 * @param value {*=} */
	notify_(action, path, value, oldVal) {

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

		// Old way:
		// for (let name in this.subs_)
		// 	if (name.startsWith(cpath))
		// 		for (let callback of this.subs_[name])
		// 			callback.apply(this.obj_, arguments); // "this.obj_" so it has the context of the original object.
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
		traversePath(this.fields_, path, 1);

		// Traverse up the path and watch each object.
		// This is commented out because it causes too much chaos, virally turning innocent objects into proxies.
		// This ensures that Object.defineProperty() is called at every level if it hasn't been previously.
		// But will this lead to callback() being called more than once?  It seems not.
		/*
		let parentPath = path; // path to our subscribed field within the parent.
		let parent = self.fields_;
		while (parentPath.length > 1) {
			parent = parent[parentPath[0]]; // go up to next level.
			let p = parentPath;
			parentPath = parentPath.slice(1); // remove first from array

			// This works for our trivial case but doesn't handle all cases in LadderBuilder.
			// I need to find a better condition than !traversePath.
			//debugger;
			if (isObj(parent) && parent[parentPath[0]] && !parent[parentPath[0]].$isProxy) {

				// Old way that does it only once.  Which really only fixed a specific case rather than being a general solution.
				// (function(parent, parentPath) {
				// 	var d = function (action, path, value) {
				// 		callback(action, path, value);
				// 		unwatch(parent, parentPath, d);
				// 	};
				// 	watch(parent, parentPath, d);
				// })(parent, parentPath);

				watch(parent, parentPath, function(action, path, value) {
					callback(action, p, value);
				});
				return;

			}
		}
		*/


		// Add to subscriptions
		let cpath = csv(path);
		if (!(cpath in self.subs_))
			self.subs_[cpath] = [];
		self.subs_[cpath].push(callback);
	}

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
				this.subs_[cpath].splice(callbackIndex, 1); // splice() modifies array in-place
			}

			// Remove the whole subscription array if it's empty.
			if (!callback || !this.subs_[cpath].length)
				delete this.subs_[cpath];

			// Undo the Object.defineProperty() call when there are no more subscriptions to it.
			let propCpath = csv([path[0]]);

			// If here are no subscriptions that start with prpocPath
			if (!keysStartWith(this.subs_, propCpath).filter((x) => x.length).length) {

				delete this.obj_[path[0]]; // Remove the defined property.
				this.obj_[path[0]] = this.fields_[path[0]]; // reset original unproxied value to object.

				delete this.fields_[path[0]];
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
	obj = obj.$removeProxy || obj;

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
	obj = obj.$removeProxy || obj;
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

;

/*
Inherit from XElement to create custom HTML Components.


TODO: major bugfixes
LB Add a bunch of functions/rungs/etc then remove them.  Typing characters still has small redraw leaks.
Changing sort order breaks items.
Write a better parser for expr.replace(/this/g, 'parent');
parseVars("this.passthrough(x)") doesn't find x.
parseVars("item + passthrough('')") finds "passthrough" as a variable.
Document all properties that bindings.loop() sets on elements.

TODO: next goals:
{{var}} in text and attributes, and stylesheets?
Fix failing Edge tests.
allow comments in loops.
x-elements in loops get fully initialized then replaced.  Is this still true?




Make shadowdom optional.

implement other binding functions.
allow loop over slots if data-loop is on the instantiation.
allow loop over more than one html tag.
cache results of parseVars() and other parse functions?
functions to enable/disable updates.
function to trigger updates?  Or a callback to apply all updates before DOM is updated.

create from <template> tag
When a change occurs, create a Set of functions to call, then later call them all.
	That way we remove some duplicate updates.
Auto bind to this in complex expressions if the class property already exists and the var is otherwise undefined?
improve minifcation.
Expose bindings prop in minified version to allow plugins.
non-ascii variable names.
throttle, debounce? data-val only trigger on change.  E.g. x-val:debounce(100)=""  x-visible:fade(100)=""
Auto two-way bind for simple variables?
bind to <input type="file">
bind to clipboard events
Named slot support? - https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_templates_and_slots
Separate out a lite version that doesn't do binding?
	This would also make the code easier to follow.  But what to call it?  XEl ? XElementLite?
allow ${text} variables in nested styles?
warning on loop element id.
warning if binding to id attribute assigned to element.


Disadvantages of Vue.js
10x larger.
Requires a single, special root component everything else must be within.
Doesn't use es6 classes.
Requires data and methods, can't bind directly to class props.
Doesn't support ShadowDOM, only emulates nested styles.
Requires key="" attributes everywhere to make identical elements unique.
Vue.js doesn't watch array indices or object property add/remove!
   Every time you assign have to call Vue.set(array...)
data: {} items shared between each component instance, unless it's wrapped in a function.
No id's to class properties.

Advantages of Vue.js
Fast and debugged.
Widespread use.
IDE support
---
{{ templates }} for plain text.
transition effects
Automatically adds vendor prefixes for data-styles="" binding.
key/value iteration over objects.
Checkboxes and <select multiple> to array of names.
lazy modifier for input binding, to only trigger update after change.

*/




/**
 * A map between elements and the callback functions subscribed to them.
 * Each value is an array of objects with path and callback function.
 * @type {WeakMultiMap<HTMLElement, {path_:string, callback_:function}[]>} */
var elWatches = new WeakMultiMap();


/**
 * A map between elements and the events assigned to them. *
 * @type {WeakMultiMap<HTMLElement, *[]>} */
var elEvents = new WeakMultiMap();



/**
 * @param cls {Function}
 * @returns {string} */
var getXName = (cls) => {
	if (!cls.xname_) {
		let lname =  'x-' + cls.name.toLowerCase().replace(/^x/, '');
		cls.xname_ = lname;

		// If name exists, add an incrementing integer to the end.
		// TODO: Should I throw an error instead?
		for (let i = 2; customElements.get(cls.xname_); i++)
			cls.xname_ = 'x-' + lname + i;
	}
	return cls.xname_;
};

/**
 * Get the nearest XElement parent.
 * @param el {HTMLElement}
 * @returns {XElement} */
var getXParent = (el) => { // will error if not in an XParent.
	while ((el = el.parentNode) && el && el.nodeType !== 11) {} // 11 is doc fragment
	return el ? el.host : null;
};


/**
 * Follow the path to get the root XElement, returning it and the remaining path.
 * This is useful for watch()'ing the right elements with data-prop is used.
 * @param obj {object}
 * @param path {string[]}
 * @return {[XElement, string[]]} */
var getRootXElement = function(obj, path) {
	path = path.slice();
	let result = [obj, path.slice()];

	// Follow the path upward, assigning to obj at each step.
	while (obj = obj[path.shift()])
		if (obj instanceof XElement)
			result = [obj, path.slice()]; // .slice() to copy the path so that shift() doesn't modify our result.

	return result;
};


var getLoopParent = (el) => { // will error if not in an XParent.
	while ((el = (el.parentNode || el.host)) && el) {
		if (getLoopCode_(el))
			return el;
	}
	return null;
};

var getLoopCode_ = (el) => el.getAttribute && (el.getAttribute('x-loop') || el.getAttribute('data-loop'));

var getXAttrib = (el, name) => el.getAttribute && (el.getAttribute('x-' + name) || el.getAttribute('data-' + name));

var parseXAttrib = (name) => name.startsWith('x-') ? name.slice(2) : name.startsWith('data-') ? name.slice(5) : null;

/**
 * Recursively process all the data- attributes in el and its descendants.
 * @param self {XElement}
 * @param el {HTMLElement}
 * @param context {object<string, string>[]=} A map of loop variable names to their absolute reference.
 * This allows us to do variable replacement:
 *     <div>data-loop="this.items : item">
 *         <div data-val="item.name">
 *  The looped item becomes:
 *         <div data-val="this.items[0].name"> */
var bindEl = (self, el, context) => {

	bindElProps(self, el, context);
	bindElEvents(self, el, context, true);

	// TODO: assert() to make sure element isn't bound twice.
};


var bindElProps = (xelement, el, context) => {
	context = context || [];
	context = context.slice();


	// Handle data-prop and
	if (el instanceof XElement) {


		for (let attrName in el.instantiationAttributes) {
			let val = el.instantiationAttributes[attrName];
			let name = parseXAttrib(attrName);
			if (name && name !== 'prop') { // prop handled in init so it happens first.
				if (bindings[name]) // attr.value is code.
					bindings[name](xelement, val, el, context);

				//#IFDEV
				else
					throw new XElementError(attrName);
				//#ENDIF
			}
		}


		// Don't inherit within-element context from parent.
		el.context2 = (xelement.context2 || []).slice();

		let prop = getXAttrib(el, 'prop');
		if (prop) {

			// Here we still need to use the inner context of the parent XElement because
			// prop may have variables within it that may need to be resolved.
			bindings.prop(xelement, prop, el, context); // adds a new context to the beginning of the array.

			// Then we add the new context item added by prop();
			context = [context[0], ...el.context2];
		}
		else
			context = el.context2.slice();



		for (let attrName in el.definitionAttributes) {
			let val = el.definitionAttributes[attrName];
			let name = parseXAttrib(attrName);
			if (name && name !== 'prop') { // prop handled in init so it happens first.
				if (bindings[name]) // attr.value is code.
					bindings[name](el, val, el, context);

				//#IFDEV
				else
					throw new XElementError(attrName);
				//#ENDIF
			}
		}


		xelement = el;
	}


	// Seach attributes for data- bindings.
	else if (el.attributes) { // shadow root has no attributes.
		for (let attr of el.attributes) {
			let attrName = parseXAttrib(attr.name);
			if (attrName && attrName !== 'prop') { // prop handled in init so it happens first.
				if (bindings[attrName]) // attr.value is code.
					bindings[attrName](xelement, attr.value, el, context);

				//#IFDEV
				else
					throw new XElementError(attrName);
				//#ENDIF
			}
		}
	}





	// Data loop already binds its own children when first applied.
	// So we don't iterate into those children.
	if (!getLoopCode_(el)) {

		// Allow traversing from host element into its own shadowRoot
		let next = el.shadowRoot || el;

		for (let child of next.children)
			bindElProps(xelement, child, context);
	}
};



/**
 * We rebind event attributes because otherwise there's no way
 * to make them call the class methods.
 * @param xelement {XElement}
 * @param el {HTMLElement}
 * @param context {object<string, string>=}
 * @param recurse {boolean=false}
 * @param getAttributesFrom {HTMLElement=} */
var bindElEvents = (xelement, el, context, recurse, getAttributesFrom) => {

	if (el.getAttribute) { // if not document fragment
		getAttributesFrom = getAttributesFrom || el;

		for (let eventName of eventNames) {
			let originalEventAttrib = getAttributesFrom.getAttribute('on' + eventName);
			if (originalEventAttrib) {

				let code = replaceVars(originalEventAttrib, context);

				// If it's a simple function that exists in the class,
				// add the "this" prefix.
				let path = parseVars(code, 0, 1)[0];
				if (path && traversePath(xelement, path) instanceof Function)
					code = addThis(code, context, isStandaloneCall);

				// The code in the attribute can reference:
				// 1. event, assigned to the current event.
				// 2. this, assigned to the class instance.
				let callback = function (event) {
					// TODO: safeEval() won't work here because we have to have event in the scope.
					eval(code);
				}.bind(xelement);
				el.addEventListener(eventName, callback);

				// Save everything we'll need to restore it later.
				elEvents.add(el, [eventName, callback, originalEventAttrib, xelement]);
				//addElEvent(el, eventName, callback, originalEventAttrib, xelement);

				// Remove the original version so it doesn't also fire.
				el.removeAttribute('on' + eventName);
			}
		}
	}

	if (recurse) {
		// Allow traversing from host element into its own shadowRoot
		let next = el.shadowRoot || el;
		if (el instanceof XElement)
			xelement = el;

		// data-loop handles its own children.
		if (!getLoopCode_(next))
			for (let child of next.children)
				bindElEvents(xelement, child, context, true);
	}
};




/**
 * Unbind properties and events from the element.
 * @param xelement {XElement|HTMLElement}
 * @param el {HTMLElement=} Remove all bindings within root and children. Defaults to self. */
var unbindEl = (xelement, el) => {
	el = el || xelement;

	// Only go into shadowroot if coming from the top level.
	// This way we don't traverse into the shadowroots of other XElements.
	var next = xelement===el && el.shadowRoot ? el.shadowRoot : el;

	// Recursively unbind children.
	for (let child of next.children)
		unbindEl(xelement, child);

	var parent;

	// Unbind properties
	if (el.attributes)
		for (let attr of el.attributes) {
			if (attr.name.startsWith('x-') || attr.name.startsWith('data-')) {

				if ((attr.name === 'x-loop' || attr.name === 'data-loop') && el.loopHtml_) {
					el.innerHTML = el.loopHtml_; // revert it back to the look template element.
					delete el.loopHtml_;
					delete el.items_;
					delete el.loopChildren;
				}

				// New
				let watches = elWatches.getAll(el);
				for (let w of watches)
					unwatch(...w);
				elWatches.removeAll(el);
			}
		}

	// Unbind events
	let ee = elEvents.getAll(el) || [];
	for (let item of ee) { //  item is [event:string, callback:function, originalCode:string, root:XElement]

		// Only unbind if it was bound from the same root.
		// This is needed to allow onclick="" attributes on both the definition and instantiation of an element,
		// and having their "this" bound to themselves or the parent element, respectively.
		if (item[3] === xelement) {
			el.removeEventListener(item[0], item[1]);
			el.setAttribute('on' + item[0], item[2]);
		}
	}
};


var setAttribute = (self, name, value) => {

	// Copy to class properties.
	// This doesn't work because the properties aren't created until after initHtml() is called.
	if (!isValidAttribute(self, name)) {

		// As javascript code to be evaluated.
		// TODO: Should this feature be deprecated or moved to data-properties  Overlap with data-prop?
		if (value && value.length > 2 && value.startsWith('{') && value.endsWith('}')) {
			self[name] = safeEval.call(self, value.slice(1, -1)); // code to eval
		}
		else
			self[name] = value;
	}

	// Copy attribute as an attribute.
	else
		self.setAttribute(name, value);
};


let disableBind = 0;

var initHtml = (self) => {

	if (!self.init_) {

		self.init_ = 1;

		//#IFDEV
		if (!self.constructor.html_)
			throw new XElementError('XElement .html property must be set to a non-empty string.');
		//#ENDIF

		// 1. Create temporary element.
		disableBind++;
		var div = createEl(self.constructor.html_.trim()); // html_ is set from ClassName.html = '...'
		disableBind--;


		// Save definition attributes
		self.definitionAttributes = {};
		for (let attr of div.attributes)
			self.definitionAttributes[attr.name] = attr.value;

		// 2. Remove and save attributes from instantiation.
		self.instantiationAttributes = {};
		for (let attr of self.attributes) // From instantiation.
			self.instantiationAttributes[attr.name] = attr.value;

		// 3.  Add attributes from definition (Item.html='<div attr="value"')
		for (let attr of div.attributes) { // From definition
			if (attr.name)
				setAttribute(self, attr.name, attr.value);
		}

		// 4. Bind events on the defintion to functions on its own element and not its container
		// TODO: Remove this line and make the bindElEvents() smart enough to know what to do on its own, like we did with bindElProps()
		bindElEvents(self, self, null, false, div);

		// 5.  Add attributes from instantiation.
		for (let name in self.instantiationAttributes) // From instantiation
			setAttribute(self, name, self.instantiationAttributes[name]);

		// 6. Create Shadow DOM
		self.attachShadow({mode: 'open'});
		while (div.firstChild)
			self.shadowRoot.insertBefore(div.firstChild, null);
		var root = self.shadowRoot || self;


		/*
		// Old version before shadow dom:
		// Html within <x-classname>...</x-classname>, where the tag is added to another element.
		// This only works in the Edge shim.  It's an empty string in chrome and firefox.
		var slotHtml = self.innerHTML;
		var slot = div.querySelector('#slot');
		if (slot)
			slot.removeAttribute('id');

		// Copy children from temporary div to this class.
		if (slot || !slotHtml) {
			self.innerHTML = '';
			while (div.firstChild)
				self.appendChild(div.firstChild);
		}

		// Copy children from <x-classname> into the slot.
		if (slotHtml)
			(slot || self).innerHTML = slotHtml;
		*/


		// 7. Create class properties that reference any html element with an id tag.
		for (let node of root.querySelectorAll('[id]')) {
			let id = node.getAttribute('id');

			//#IFDEV
			// Make sure we're not replacing an existing method.
			if (id in self && self[id] instanceof Function)
				throw new XElementError('Cannot set property "' + id + '" on "' + self.constructor.name +
					'" because there is already a class method with the same name.');
			//#ENDIF

			Object.defineProperty(self, id, {
				// Make it readonly.
				// Using writeable: false caused errors if the getter returns a proxy instead of the proper type.
				// But how does it know it's the wrong type?

				enumerable: 1,
				configurable: 1,
				get: () => node,
				//#IFDEV
				set: () => {
					throw new XElementError('Property ' + id + ' not writable');
				}
				//#ENDIF
			});

			// Only leave the id attributes if we have a shadow root.
			// Otherwise we'll have duplicate id's in the main document.
			if (!self.shadowRoot)
				node.removeAttribute('id');
		}


		if (disableBind === 0) {

			// 8. Bind all data- and event attributes
			// TODO: Move bind into setAttribute above, so we can call it separately for definition and instantiation?
			bindElProps(self, self);


			// We pass root to bind all events on this element's children.
			// We bound events on the element itself in a separate call to bindElEvents(self, self) above.
			bindElEvents(self, root, null, true);
		}
	}
};

/**
 * @extends HTMLElement
 * @extends Node
 * Inherit from this class to make a custom HTML element.
 * If you extend from XElement, you can't instantiate your class unless you first set the html property.
 * This is because XElement extends from HTMLElement, and setting the .html property calls customElements.define(). */
class XElement extends HTMLElement {

	constructor() {
		//#IFDEV
		try {
			//#ENDIF
			super();
			//#IFDEV
		} catch (error) {
			if (error instanceof TypeError) // Add helpful message to error:
				error.message += '\nMake sure to set the .html property before instantiating the class "' + this.name + '".';
			throw error;
		}
		//#ENDIF

		let xname = getXName(this.constructor);
		let self = this;
		if (customElements.get(xname))
			initHtml(self);
		else
			customElements.whenDefined(xname).then(() => {
				initHtml(self);
			});
	}
}


/*
let queuedOps = new Set();
let queueDepth = 0;

XElement.enqueue = function(callback) {
	return function() {
		if (queueDepth === 0)
			return callback();
		else
			queuedOps.add(callback);
	};
};

// Untested.  It might not be possible to use this without screwing things up.
XElement.batch = function(callback) {
	return function() {
		if (queueDepth)
			queuedOps.add(callback);
		else {
			queueDepth++;

			let result = callback(...arguments);

			queueDepth--;
			if (queueDepth === 0) {
				for (let op of queuedOps)
					op();
				queuedOps = new Set();
			}

			return result;
		}
	}
};
*/


// TODO: write a function to replace common code among these.
var bindings = {

	/**
	 * When self.field changes, update the value of <el attr>.
	 * This binding is used if one of the other names above isn't matched.
	 * @param self {XElement}
	 * @param code {string}
	 * @param el {HTMLElement}
	 * @param context {object<string, string>} */
	attribs: (self, code, el, context) => {
		var obj = parseObj(code);
		for (let name in obj) {
			let attrExpr = addThis(replaceVars(obj[name], context), context);

			let setAttr = /*XElement.batch(*/function (/*action, path, value*/) {
				var result = safeEval.call(self, attrExpr);
				if (result === false || result === null || result === undefined)
					el.removeAttribute(name);
				else
					el.setAttribute(name, result + '');
			}/*)*/;

			// If the variables in code, change, execute the code.
			// Then set the attribute to the value returned by the code.
			for (let path of parseVars(attrExpr)) {
				watch(self, path, setAttr);
				elWatches.add(el, [self,  path, setAttr]);
			}

			setAttr();
		}
	},

	/**
	 * @param self {XElement}
	 * @param code {string}
	 * @param el {HTMLElement}
	 * @param context {object<string, string>} */
	classes: (self, code, el, context) => {

		var obj = parseObj(code);
		for (let name in obj) {
			let classExpr = addThis(replaceVars(obj[name], context), context);

			// This code is called on every update.
			let updateClass = /*XElement.batch*/() => {
				let result = safeEval.call(self, classExpr);
				if (result)
					el.classList.add(name);
				else {
					el.classList.remove(name);
					if (!el.classList.length) // remove attribute after last class removed.
						el.removeAttribute('class');
				}
			}/*)*/;


			// Create properties and watch for changes.
			for (let path of parseVars(classExpr)) {
				let [root, pathFromRoot] = getRootXElement(self, path);
				watch(root, path, updateClass);
				elWatches.add(el, [root, pathFromRoot, updateClass]);
			}

			// Set initial values.
			updateClass();
		}
	},

	/**
	 * @param self {XElement}
	 * @param code {string}
	 * @param el {HTMLElement}
	 * @param context {object<string, string>} */
	text: (self, code, el, context) => {
		code = addThis(replaceVars(code, context), context);
		let setText = /*XElement.batch(*/(/*action, path, value*/) => {
			el.textContent = safeEval.call(self, code);
		}/*)*/;
		for (let path of parseVars(code)) {
			let [root, pathFromRoot] = getRootXElement(self, path);
			watch(root, pathFromRoot, setText);
			elWatches.add(el, [root, pathFromRoot, setText]);
		}

		// Set initial value.
		setText();
	},

	/**
	 * @param self {XElement}
	 * @param code {string}
	 * @param el {HTMLElement}
	 * @param context {object<string, string>} */
	html: (self, code, el, context) => {
		code = addThis(replaceVars(code, context), context);
		let setHtml = /*XElement.batch(*/(/*action, path, value*/) => {
			el.innerHTML = safeEval.call(self, code);
		}/*)*/;

		for (let path of parseVars(code)) {
			let [root, pathFromRoot] = getRootXElement(self, path);
			watch(self, pathFromRoot, setHtml);
			elWatches.add(el, [root,  pathFromRoot, setHtml]);
		}

		// Set initial value.
		setHtml();
	},


	// TODO: Removing an item from the beginning of the array copy the first to the 0th,
	// then createEl a new 1st item before deleting it when rebuildChildren is called again with the delete operation.
	// Batching updates into a set should fix this.
	/**
	 * @param self {XElement}
	 * @param code {string}
	 * @param el {HTMLElement}
	 * @param context {object<string, string>} */
	loop: (self, code, el, context) => {

		// Make sure loop isn't being bound to a parent element in addition to the child XElement.
		// if (el instanceof XElement && el !== self)
		// 	return;

		context = context || [];
		//context = context.slice(); // copy, because we add to it as we descend.

		// Parse code into foreach parts
		var [foreach, loopVar, indexVar] = parseLoop(code);
		foreach = replaceVars(foreach, context);
		foreach = addThis(foreach, context);
		el.context_ = context;  // Used in sortable.

		// Allow loop attrib to be applied above shadowroot.
		let root = el.shadowRoot || el;

		var rebuildChildren = /*XElement.batch(*/(action, path, value, oldVal, indirect) => {

			// The modification was actually just a child of the loop variable.
			// The loop variable itself wasn't assigned a new value.
			if (indirect)
				return;

			// The code we'll loop over.
			// We store it here because innerHTML is lost if we unbind and rebind.
			if (!root.loopHtml_) {

				//#IFDEV
				if (root.children.length !== 1)
					throw new XElementError('x-loop="' + code + '" must have exactly one child html element.  ' +
						'This restriction may be removed in the future.');
				//#ENDIF

				root.loopHtml_ = root.innerHTML.trim();
				root.loopChildren = Array.from(root.children);

				// Remove children before calling rebuildChildren()
				// That way we don't unbind elements that were never bound.
				while (root.lastChild)
					root.removeChild(root.lastChild);
			}

			//#IFDEV
			if (!root.loopHtml_)
				throw new XElementError('x-loop="' + code + '" rebuildChildren() called before bindEl().');
			//#ENDIF

			var newItems = (safeEval.call(self, foreach) || []);
			newItems = newItems.$removeProxy || newItems;
			var oldItems = (root.items_ || []);
			oldItems = oldItems.$removeProxy || oldItems;

			// Do nothing if the array hasn't changed.
			if (arrayEq(oldItems, newItems, true))
				return;

			// Set temporary index on each child, so we can track how they're re-ordered.
			for (let i=0; i< root.children.length; i++)
				root.children[i].index_ = i;

			// Create a map from the old items to the elements that represent them.
			// This will fail if anything else has been changing the children order.
			var oldMap = new Map();
			var newSet = new Set(newItems);
			for (let i=oldItems.length-1; i>=0; i--) {
				let oldItem = oldItems[i];
				let child = root.children[i];

				// And remove any elements that are no longer present.
				if (!newSet.has(oldItem)) {
					unbindEl(child);
					root.removeChild(child);
				}

				// Create a list of items we want to keep, indexed by their value.
				// If there are duplicates, we add them to the array.
				// This prevents us from destroying and recreating the same elements,
				// Which is slower and makes form elements lose focus while typing.
				else if (oldMap.has(oldItem))
					oldMap.get(oldItem).push(child);
				else
					oldMap.set(oldItem, [child]);
			}

			// Loop through newItems, creating and moving children as needed.
			for (let i=0; i<newItems.length; i++) {
				let oldChild = root.children[i];
				let newChild = (oldMap.get(newItems[i]) || []).pop(); // last on, first off b/c above we iterate in reverse.
				let isNew = !newChild;

				// If the existing child doesn't match the new item.
				if (!oldChild || oldChild !== newChild) {

					// Create a new one if needed.
					// TODO: createEl() binds nexted x-elements before we're ready for them to be bound.
					// E.g. below we set the localContext for loop variables.
					if (isNew) {
						disableBind ++;
						newChild = createEl(root.loopHtml_);
						disableBind --;

					}
					// This can either insert the new one or move an old one to this position.
					root.insertBefore(newChild, oldChild);
				}
			}

			// If there are identical items in the array, some extras can be left at the end.
			for (let i=root.children.length-1; i>=newItems.length; i--) {
				let child = root.children[i];
				if (child) {
					unbindEl(child);
					root.removeChild(child);
				}
			}



		

			// Rebind events on any elements that had their index change.
			for (let i=0; i< root.children.length; i++) {
				let child = root.children[i];
				if (child.index_ !== i) {

					let localContext =  {...context[0]};
					
					//#IFDEV
					if (loopVar in localContext)
						throw new XElementError('Loop variable "' + loopVar + '" already used in outer loop.');
					if (indexVar && indexVar in localContext)
						throw new XElementError('Loop index variable "' + indexVar + '" already used in outer loop.');
					//#ENDIF

					// TODO, if child is an xelement, this won't unbind any events within it!

					// If it wasn't just created:
					//if (child.hasOwnProperty('index_'))
					unbindEl(self, child);

					localContext[loopVar] = foreach + '[' + i + ']';
					if (indexVar !== undefined)
						localContext[indexVar] = i;

					// Save the context on every loop item.
					// This is necessary for updating the x-prop watch below.
					// TODO: That code is removed, so we no longer need this line.
					child.context_ = localContext;

					bindEl(self, child, [localContext, ...context.slice(1)]);
				}
				delete child.index_;
			}

			// Save the items on the loop element, so we can compare them to their modified values next time the loop is rebuilt.
			root.items_ = newItems.slice(); // copy TODO: Should this be el not root?

		}/*)*/;

		for (let path of parseVars(foreach)) {
			let [root, pathFromRoot] = getRootXElement(self, path);
			watch(root, pathFromRoot, rebuildChildren);
			elWatches.add(el, [root, pathFromRoot, rebuildChildren]);
		}

		// Set initial children
		rebuildChildren();
	},

	/**
	 * @param self {XElement} A parent XElement
	 * @param code {string}
	 * @param el {HTMLElement} An XElement that's a child of self, that has a data-prop attribute.
	 * @param context {object<string, string>[]} */
	prop: (self, code, el, context) => {

		//#IFDEV
		if (!context)
			throw new XElementError();
		if (!Array.isArray(context))
			throw new XElementError();
		if (!(el instanceof XElement))
			throw new XElementError('The data-prop and x-prop attributes can only be used on XElements in ' + code);
		//#ENDIF

		// allow binding only on instantiation and not definition
		if (self !== el) {
			el.parent = self;

			var obj = parseObj(code);
			for (let prop in obj) {

				//#IFDEV
				if (prop === 'this')
					throw new XElementError('Cannot use data-propx or x-prop to bind to "this" as a destination in ' + code);
				//#ENDIF

				// Add 'this' prefix to standaline variables.
				let expr = obj[prop];
				expr = trimThis(expr);
				expr = replaceVars(expr, context);
				expr = addThis(expr, context);


				// Add the parent property to the context.
				let expr2 = expr.replace(/this/g, 'parent'); // TODO: temporary lazy way until I write actual parsing
				let newContext = {};
				newContext[prop] = expr2;
				context.unshift(newContext);

				// Create a property so we can access the parent.
				// This is often deleted and replaced by watch()
				Object.defineProperty(el, prop, {
					configurable: true,
					get: function () {
						return safeEval.call(self, expr);
					}
				});


				// Attempt 2:  fails the props test because
				// el.propGetter = function () {
				// 	return safeEval.call(self, expr);
				// };
				//
				// // This will be replaced if something subscribes to prop.
				// Object.defineProperty(el, prop, {
				// 	configurable: true,
				// 	get: function () {
				// 		if (window.init)
				// 			debugger;
				// 		return safeEval.call(self, expr);
				// 	},
				// 	set: function(val) {
				// 		let paths = parseVars(expr);
				// 		traversePath(self, paths[0], true, val);
				// 	}
				// });

				// Attempt 3: works except for embed, loopnested, and events:
				// Will probably cause too much redraw, as assigning a whole object will trigger updates of all its children.
				// let paths = parseVars(expr);
				// for (let path of paths) {
				// 	let updateProp = function() {
				// 		el[prop] = safeEval.call(self, expr);
				//
				// 	};
				// 	watch(self, path, updateProp);
				// 	elWatches.add(el,[self, path, updateProp]);
				// }
				//
				// el[prop] = safeEval.call(self, expr);
			}
		}
	},

	// Requires Sortable.js
	// does not support dynamic (watch) binding.
	sortable: (self, code, el, context) => {
		var result = {};

		// Build arguments to send to Sortable.
		if (code) { // we also allow a bare sortable attribute with no value.
			var obj = parseObj(code);
			for (let name in obj) {
				let expr = addThis(replaceVars(obj[name], context), context);
				result[name] = safeEval.call(self, expr);
			}
		}

		// If sorting items bound to a loop, and the variable is standaline,
		// then update the original array after items are dragged.
		var loopCode = getLoopCode_(el);
		if (loopCode) {

			let [foreach, loopVar, indexVar] = parseLoop(loopCode);
			//#IFDEV
			if (!isStandaloneVar(foreach))
				throw new XElementError("Binding sortable to non-standalone loop variable.");
			//#ENDIF

			// Get the path to the array we'll update when items are dragged:
			foreach = addThis(replaceVars(foreach, context), context);
			let path = parseVars(foreach)[0];

			// Get values passed in by the user.
			var onAdd = result.onAdd;
			var onUpdate = result.onUpdate;

			// Update the arrays after we drag items.
			var moveItems = function(event) {
				let oldSelf = getXParent(event.from);
				let newSelf = getXParent(event.to);

				let oldContext = event.from.context_;
				let oldForeach = parseLoop(getLoopCode_(event.from))[0];
				oldForeach = addThis(replaceVars(oldForeach, oldContext), oldContext);
				let oldArray = safeEval.call(oldSelf, oldForeach).slice();

				let newArray = oldSelf === newSelf ? oldArray : safeEval.call(newSelf, foreach).slice();

				let item;
				if (event.pullMode === 'clone')
					item = oldArray[event.oldIndex];
				else
					item = oldArray.splice(event.oldIndex, 1)[0];

				newArray.splice(event.newIndex, 0, item);


				// Set the newArray without triggering notifications.
				// Because a notification will cause data-loop's rebuildChildren() to be called
				// And Sortable has already rearranged the elements.
				//debugger;
				let array = traversePath(newSelf, path, true, newArray, true);
				rebindLoopChildren(newSelf, event.to, [context], oldSelf); // But we still need to unbind and rebind them in their currnet positions.
				array.$trigger; // This won't trigger rebuilding our own children because their order already matches.


				// If origin was a different loop:
				if (newSelf !== oldSelf && event.pullMode !== 'clone') {
					let array = traversePath(oldSelf, path, true, oldArray, true);
					rebindLoopChildren(oldSelf, event.from, [context]);
					array.$trigger;
				}


			};

			result.onAdd = function(event) {
				moveItems(event);
				if (onAdd)
					onAdd.call(self, event);
			};

			result.onUpdate = function(event) {
				moveItems(event);
				if (onUpdate)
					onUpdate.call(self, event);
			};
		}




		Sortable.create(el, result);
	},

	/**
	 * Special 2-way binding
	 * @param self {XElement}
	 * @param code {string}
	 * @param el {HTMLElement}
	 * @param context {object<string, string>} */
	val: (self, code, el, context) => {
		code = addThis(replaceVars(code, context), context);

		// Update object property when input value changes, only if a simple var.
		var paths = parseVars(code);
		if (paths.length === 1 && isStandaloneVar(code))
			el.addEventListener('input', () => {
				let value;
				if (el.type === 'checkbox')
					value = el.checked;
				else
					value = el.value || el.innerHTML || ''; // works for input, select, textarea, [contenteditable]

				// We don't use watchlessSet in case other things are subscribed.
				traversePath(self, paths[0], true, value);
			});

		let setVal = /*XElement.batch*/(/*action, path, value*/) => {
			let result = safeEval.call(self, code);

			if (el.type === 'checkbox')
			// noinspection EqualityComparisonWithCoercionJS
				el.checked = result == true;
			else
				el.value = result;
		}/*)*/;

		// Update input value when object property changes.
		for (let path of paths) {
			let [root, pathFromRoot] = getRootXElement(self, path);
			watch(root, pathFromRoot, setVal);
			elWatches.add(el, [root, pathFromRoot, setVal]);
		}

		// Set initial value.
		setVal();
	},

	/**
	 * @param self {XElement}
	 * @param code {string}
	 * @param el {HTMLElement}
	 * @param context {object<string, string>} */
	visible: (self, code, el, context) => {
		code = addThis(replaceVars(code, context), context);
		var displayNormal = el.style.display;
		if (displayNormal === 'none')
			displayNormal = '';

		let setVisible = /*XElement.batch*/(/*action, path, value*/) => {
			el.style.display = safeEval.call(self, code) ? displayNormal : 'none';
		}/*)*/;

		for (let path of parseVars(code)) {
			let [root, pathFromRoot] = getRootXElement(self, path);
			watch(root, pathFromRoot, setVisible);
			elWatches.add(el, [root, pathFromRoot, setVisible]);
		}

		// Set initial value.
		setVisible();
	},

	/*
	'style': function(self, field, el) {}, // Can point to an object to use for the style.
	'if': function(self, field, el) {}, // Element is created or destroyed when data-if="code" evaluates to true or false.
	*/
};


/**
 * Unbind and rebind every child of element el with data-loop attribute.
 * TODO: Only update changed children.  Merge from this and similar code in rebuildChildren().
 * @param self {XElement}
 * @param el {HTMLElement}
 * @param context {object<string, string>[]}
 * @param oldSelf {XElement=} Will be different than self if the items were moved from one list to another. */
var rebindLoopChildren = function(self, el, context, oldSelf) {
	oldSelf = oldSelf || self;
	let [foreach, loopVar, indexVar] = parseLoop(getLoopCode_(el));
	foreach = addThis(replaceVars(foreach, context), context);

	let localContext = {};
	for (let i=0; i<el.children.length; i++) {
		let child = el.children[i];

		unbindEl(oldSelf, child);

		localContext[loopVar] = foreach + '[' + i + ']';
		if (indexVar !== undefined)
			localContext[indexVar] = i;

		bindEl(self, child, [localContext, ...context]);
	}

	el.items_ = safeEval.call(self, foreach).slice();
	//delete el.items_;
};

/**
 * Override the static html property so we can call customElements.define() whenever the html is set.*/
Object.defineProperty(XElement, 'html', {
	get: () => this.html_,
	set: function (html) {

		// TODO: We want to be able to do:
		// <x-item arg1="1", arg2="2">
		// And have those passed to Item's constructor.
		// Here we can get the names of those arguments, but how to intercept the browser's call to the constructor?
		// Below I tried to work around this by subclassing.
		// But we can't get a reference to the <x-item> to read its attributes before the super() call.
		// const self = this;
		// function getConstructorArgs(func) {
		// 	return func.toString()  // stackoverflow.com/a/14660057
		// 		.replace(/((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg,'') // Remove comments. TODO: Also remove strings.
		// 		.match(/^\s*constructor\s*\(\s*([^)]*)\)\s*{/m)[1] // submatch "constructor(...) {"
		// 		.split(/\s*,\s*/);
		// }
		// var args = getConstructorArgs(this);
		//
		// class Embedded extends this {
		// 	constructor() {
		// 		var attrib0 = this.getAttribute(args[0]); // fails.  Can't use "this".
		// 		super(attrib0);
		// 	}
		// }

		// Could the customElements.whenDefined() callback be helpful?

		// New way where we pass attributes to the constructor:
		// customElements.define(name, Embedded);
		// customElements.define(name+'-internal', this);

		// Old way:
		customElements.define(getXName(this), this);

		return this.html_ = html;
	}
});

// Exports
XElement.bindings = bindings;
window.XElement = XElement;
})();