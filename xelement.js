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
 * @param deep {boolean=false}
 * @returns {boolean} */
var arrayEq = (array1, array2, deep) => {
	if (!array1 || !array2 || array1.length !== array2.length)
		return false;

	array2 = removeProxy(array2);
	return removeProxy(array1).every((value, index) => {
		if (deep && Array.isArray(value))
			return arrayEq(value, array2[index]);
		return eq(value, array2[index]);
	})
};

var eq = (item1, item2) => {
	return (item1.$removeProxy || item1) === (item2.$removeProxy || item2);
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


var createElMap = {};

var createEl = (html) => {
	let existing = createElMap[html];
	if (existing)
		return existing.cloneNode(true);


	//#IFDEV
	if (typeof html !== 'string')
		throw new XElementError('Html argument must be a string.');
	//#ENDIF

	let tagName = html.trim().match(/<([a-z0-9-]+)/i);
	if (tagName)
		tagName = tagName[1];

	// Using a template makes some embed related tests fail to instantiate x-elements.
	let parentMap = {
		td: 'tr',
		tr: 'tbody',
		tbody: 'table',
		thead: 'table',
		tfoot: 'table',
		source: 'video',
		area: 'map',
		legend: 'fieldset',
		option: 'select',
		col: 'colgroup',
		param: 'object'
	};
	let parentTag = parentMap[tagName] || 'div';

	var parent = document.createElement(parentTag);
	parent.innerHTML = html;
	var result = parent.removeChild(parent.firstChild);

	createElMap[html] = result;
	return result.cloneNode(true); // clone so that subsequent changes don't break our cache.
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
 * @param isStatements {boolean=false}
 * @returns {*} */
function safeEval(expr, args, isStatements) {

	let code = isStatements ? expr : 'return (' + expr + ')';
	if (args && Object.keys(args).length) {

		// Convert args object to var a=arguments[0][name] assignments
		let argAssignments = [];
		for (let name in args)
			argAssignments.push(name + '=arguments[0]["' + name.replace(/"/g, '\"') + '"]');

		code = 'var ' + argAssignments.join(',') + ';' + code;
	}

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
var varStartRegex = new RegExp(identifier + '\\s*\\(?', 'gi');
var varPropRegex  = new RegExp(varPropOrFunc, 'gi');

// https://mathiasbynens.be/notes/javascript-identifiers
// We exclude 'let,package,interface,implements,private,protected,public,static,yield' because testing shows Chrome accepts these as valid var names.
var nonVars = 'length,NaN,Infinity,caller,callee,prototype,arguments,true,false,null,undefined,break,case,catch,continue,debugger,default,delete,do,else,finally,for,function,if,in,instanceof,new,return,switch,throw,try,typeof,var,void,while,with,class,const,enum,export,extends,import,super'.split(/,/g);
var nonVars2 = 'super,NaN,Infinity,true,false,null,undefined'.split(/,/g); // Don't add "this." prefix to thse automatically.

/**
 * A stanalone var can automatically have "this." prepended to it.
 * @param {string} code
 * @returns {boolean} */
var isStandaloneVar = (code) => {
	return !nonVars2.includes(code) && !!code.trim().match(isStandaloneVarRegex);
};
var isStandaloneCall = (code) => {
	// if it starts with a variable followed by ( and has no more than one semicolon.
	code = code.trim();

	// If there's a semicolon other than at the end.
	// TODO: This doesn't account for if there's a semicolon in a string argument to the function.
	var semi = code.indexOf(';');
	if (semi !== -1 && semi !== code.length-1)
		return false;

	return !nonVars2.includes(code) && !!code.match(isSimpleCallRegex);
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
		var item = undefined;
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
				item = matches.filter(Boolean)[1];

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
		else if (!matches /*item !== 'this'*/) // if we found nothing, stop entirely.
			break;
	}

	return result;
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
		let value =  piece.slice(colon+1).trim();
		if (value) {
			let key = piece.slice(0, colon).trim();
			result[key] = value;
		}

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
	var result = code.split(/[,:](?=[^:]+$)/).map((x)=>x.trim()); // split on comma and colon only if there's no subsequent colons.
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
 * TODO: This only works for standalone variables.
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
	let contextVars = Object.keys(context || {});
	for (let pre of [prefix, ...contextVars])
		if (code.match(new RegExp('^' + pre + '(\s*[\.[]|$)'))) // starts with "prefix." or "prefix["
			return code;

	return prefix + '.' + code;
};

// Exports
window.parseLoop = parseLoop; // temporary for EditableSelect.;

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
		if (isObj(result) && !(result instanceof Node)) {

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
 * Watches will not extend into HTML elements and nodes.
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

;


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
					callback.apply(this.obj_, arguments)
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

				let oldSubVal = removeProxy(traversePath(oldVal, oldSubPath));
				let newSubVal = removeProxy(traversePath(newVal, oldSubPath));

				if (oldSubVal !== newSubVal) {
					let callbacks = this.subs_[name];
					if (callbacks.length) {
						let fullSubPath = JSON.parse('[' + name + ']');
						for (let callback of callbacks)  // [below] "this.obj_" so it has the context of the original object.
							callback.apply(this.obj_, [action, fullSubPath, newSubVal, oldSubVal]);
					}
				}
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
;

"use strict";


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
				var result = safeEval.call(self, attrExpr, {el: el});
				if (result === false || result === null || result === undefined)
					el.removeAttribute(name);
				else
					el.setAttribute(name, result + '');
			}/*)*/;

			// If the variables in code, change, execute the code.
			// Then set the attribute to the value returned by the code.
			for (let path of parseVars(attrExpr)) {
				let [root, pathFromRoot] = getRootXElement(self, path);
				watch(root, pathFromRoot, setAttr);
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
				let result = safeEval.call(self, classExpr, {el: el});
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
				watch(root, pathFromRoot, updateClass);
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
		let setText = (/*action, path, value, oldVal*/) => {
			let val = safeEval.call(self, code, {el: el});
			if (val === undefined || val === null)
				val = '';
			el.textContent = val;
		};
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
		let setHtml = (/*action, path, value, oldVal*/) => {
			let val = safeEval.call(self, code, {el: el});
			if (val === undefined || val === null)
				val = '';
			el.innerHTML = val;
		};

		for (let path of parseVars(code)) {
			let [root, pathFromRoot] = getRootXElement(self, path);
			watch(root, pathFromRoot, setHtml);
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
		context = context || [];

		// Parse code into foreach parts
		let [foreach, loopVar, indexVar] = parseLoop(code);
		foreach = replaceVars(foreach, context);
		foreach = addThis(foreach, context);
		el.context_ = context;  // Used in sortable.

		// Allow loop attrib to be applied above shadowroot.
		let root = el;

		// If we're not looping over slots, set the root to the shadowRoot.
		if (el instanceof XElement && !el.instantiationAttributes['x-loop'] && !el.instantiationAttributes['data-loop'])
			root = root.shadowRoot || root;

		var rebuildChildren = (action, path, value, oldVal, indirect) => {

			// The modification was actually just a child of the loop variable.
			// The loop variable itself wasn't assigned a new value.
			// Although indirect will also be true if adding or removing an item from the array.
			// If foreach is non-standaline, we don't know how the path will be evaluated to the array used by foreach.
			// So this is of no use right now.
			if (indirect) {
				/*
				// If deleting a single item from a list.
				// Commented out because this would only work with simple variables.
				// Maybe later I can find a better way.
				if (action==='delete') {

					debugger;
					let loopItem = traversePath(self, path.slice(0, -1));
					//if (loopItem === el) {
						let index = path.slice(-1)[0];
						let loopEl = el.shadowRoot || el;
						let child = loopEl.children[index];
						unbindEl(child);
						root.removeChild(child);
					//}
				}*/
				//return;
			}

			// The code we'll loop over.
			// We store it here because innerHTML is lost if we unbind and rebind.
			if (!root.loopHtml_) {

				//#IFDEV
				if (root.children.length !== 1)
					throw new XElementError('x-loop="' + code + '" must have exactly one child html element.  ' +
						'This restriction may be removed in the future.');
				//#ENDIF

				root.loopHtml_ = root.children[0].outerHTML.trim();

				// Remove children before calling rebuildChildren()
				// That way we don't unbind elements that were never bound.
				while (root.lastChild)
					root.removeChild(root.lastChild);
			}

			//#IFDEV
			if (!root.loopHtml_)
				throw new XElementError('x-loop="' + code + '" rebuildChildren() called before bindEl().');
			//#ENDIF

			// We don't know how the path will be evaluated to the array used by foreach, so we re-evaluate it to find out.
			// TODO: Skip this step and just use the path directly for standalone paths.
			var newItems = removeProxy(safeEval.call(self, foreach, {el: el}) || []);
			var oldItems = removeProxy(root.items_ || []);

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
			for (let i=0; i<root.children.length; i++) {
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

			// If it's a select element, reapply its x-val when its children change.
			// TODO: Should this also be done for <textarea> ?
			if (el.tagName === 'SELECT' && el.hasAttribute('x-val')) {
				let code = addThis(replaceVars(el.getAttribute('x-val'), context), context);
				el.value = safeEval.call(self, code, {el: el});
			}
		};

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
			let newContext = {};
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
				let expr2 = expr.replace(/this\./g, 'parent\.'); // TODO: temporary lazy way until I write actual parsing
				expr2 = expr2.replace(/this$/, 'parent');
				newContext[prop] = expr2;

				// Create a property so we can access the parent.
				// This is often deleted and replaced by watch()
				let descriptor = {
					configurable: true,
					get: function () {
						return safeEval.call(self, expr);
					}
				};

				// let paths = parseVars(expr);
				// for (let path of paths)
				// 	watch(self, path, () => {
				// 		el[prop] = safeEval.call(self, expr);
				// 	});


				Object.defineProperty(el, prop, descriptor);


				// Attempt 2:  fails the props test because
				// el.propGetter = function () {
				// 	return safeEval.call(self, expr);
				// };
				//
				// // This will be replaced if something subscribes to prop.
				// Object.defineProperty(el, prop, {
				// 	configurable: true,
				// 	get: function () {
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

			context.unshift(newContext);
		}
	},

	// Requires Sortable.js
	// does not support dynamic (watch) binding.
	sortable: (self, code, el, context) => {
		var options = {};

		// Build arguments to send to Sortable.
		if (code) { // we also allow a bare sortable attribute with no value.
			var obj = parseObj(code);
			for (let name in obj) {
				let expr = addThis(replaceVars(obj[name], context), context);
				options[name] = safeEval.call(self, expr, {el: el});
			}
		}

		// If sorting items bound to a loop, and the variable is standaline,
		// then update the original array after items are dragged.
		var loopCode = getLoopCode_(el);
		if (loopCode) {

			let [foreach/*, loopVar, indexVar*/] = parseLoop(loopCode);
			//#IFDEV
			if (!isStandaloneVar(foreach))
				throw new XElementError("Cannot bind sortable to non-standalone loop variable.");
			//#ENDIF


			// Update the arrays after we drag items.
			var moveItems = function(event) {

				// Update for sorting within a list.
				// Remove for dragging between lists, even if cloning.
				// Intercepting these events makes the variable el above always be the receiver.
				if (event.type === 'update' || (event.type === 'add')) {
					let item;

					// Move the element back to where it came from.
					if (event.pullMode === 'clone')
						event.to.removeChild(event.to.children[event.newIndex]);
					else {
						item = event.to.children[event.newIndex];
						event.from.insertBefore(item, event.from.children[event.oldIndex]);
					}

					// Instead we'll move it by updating the underlying data structures.
					let oldArray = getLoopElArray_(event.from);
					let newArray = oldArray;
					if (event.from !== event.to)
						newArray = getLoopElArray_(event.to);


					if (event.pullMode === 'clone')
						item = oldArray[event.oldIndex];
					else {
						item = oldArray.splice(event.oldIndex, 1)[0];
					}



					// TODO: RemoveProxies() from item.  Or modify the arra intercept functions to removeProxies() from all arguments?
					newArray.splice(event.newIndex, 0, item.$removeProxy || item);

					// Update event.item, since we manually moved it above.
					event.item = event.to.children[event.newIndex];
				}

			

			};

			// Intercept all events so we can set the proper "this" context when calling the callback.
			let events = 'setData,onChoose,onUnchoose,onStart,onEnd,onAdd,onUpdate,onSort,onRemove,onFilter,onMove,onClone,onChange'.split(/,/g);
			//let events = ['onEnd'];

			for (let eventName of events) {

				let callback = options[eventName];


				options[eventName] = function (event) {
					moveItems(event);
					if (callback)
					 	return callback.call(self, event);
				};
			}
		}


		Sortable.create(el, options);
	},

	/**
	 * Special 2-way binding
	 * @param self {XElement}
	 * @param code {string}
	 * @param el {HTMLElement|HTMLInputElement}
	 * @param context {object<string, string>} */
	val: (self, code, el, context) => {
		code = addThis(replaceVars(code, context), context);

		// Update object property when input value changes, only if a simple var.
		var paths = parseVars(code);
		if (paths.length === 1 && isStandaloneVar(code)) {
			let onInput = () => {
				let value = '';
				if (el.type === 'checkbox')
					value = el.checked;
				else if ('value' in el) // input, select
					value = el.value;
				else if (typeof el.innerHTML === 'string') // textarea, [contenteditable].  'innerHTML' in el evaluates to false, for unknown reasons.
					value = el.innerHTML;

				// We don't use watchlessSet in case other things are subscribed.
				traversePath(self, paths[0], true, value);
			};

			el.addEventListener('input', onInput);

			// Add so this binding is removed when the element is unbound (but still exists),
			// such as when it moves to a different spot in a loop or from x-sortable.
			// Covered by test simpleBinding.val.unbind()
			elEvents.add(el, ['input', onInput, null, self]);
		}

		function setVal(/*action, path, value*/) {
			let result = safeEval.call(self, code, {el: el});
			if (result === undefined || result === null)
				result = '';

			if (el.type === 'checkbox')
				// noinspection EqualityComparisonWithCoercionJS
				el.checked = result == true;
			else if (el.hasAttribute('contenteditable')) {
				if (result !== el.innerHTML)
					el.innerHTML = result;
			}
			else
				el.value = result;
		}

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

		let setVisible = (/*action, path, value*/) => {
			el.style.display = safeEval.call(self, code, {el: el}) ? displayNormal : 'none';
		};

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

var getLoopElArray_ = (loopEl, xparent) => {
	xparent = xparent || getXParent(loopEl);
	let context = loopEl.context_;
	let foreach = parseLoop(getLoopCode_(loopEl))[0];
	foreach = addThis(replaceVars(foreach, context), context);
	return safeEval.call(xparent, foreach, {el: loopEl});
};

;

/*
Inherit from XElement to create custom HTML Components.


TODO: major bugfixes
Removing a node that contains an xelement doesn't remove its items from elWatches or elsewhere?
	How to unittest this, since I can't inspect what's in weakmap?
	This can be tested in the test app by opening multiple programs.
Write a better parser for expr.replace(/this/g, 'parent');
parseVars("this.passthrough(x)") doesn't find x.
parseVars("item + passthrough('')") finds "passthrough" as a variable.
Write a getWatches(el, expr) function that calls replaceVars, addThis, parseVars, an getRootXElement
	to give back
Document all properties that bindings.loop() sets on elements.
Won't bind to properties on the class itself, insead of those defined within constructor.  Because they are called after the super constructor!
Use a regex or parser to remove the html of x-loops before they're passed to createEl().  This can remove the check at the top of initHtml() and the .initialized property.
Make sure recursive embeds work if:  1. the x-loop is on the x-parent above the shadow dom.  2. An x-element is within a div inside the loop.

TODO: next goals:
{{var}} in text and attributes, and stylesheets?
Fix failing Edge tests.
allow comments in loops.
x-elements in loops get fully initialized then replaced.  Is this still true?




Finish making shadowdom optional.

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

var getLoopCode_ = (el) => el.getAttribute && (el.getAttribute('x-loop') || el.getAttribute('data-loop'));

var getXAttrib = (el, name) => el.getAttribute && (el.getAttribute('x-' + name) || el.getAttribute('data-' + name));

var parseXAttrib = (name) => name.startsWith('x-') ? name.slice(2) : name.startsWith('data-') ? name.slice(5) : null;


var parseXAttrib2 = (name) => {
	var parts = name.split(/:/g);
	var functions = {};
	for (let i=1; i<parts.length; i++) {
		let [name, code] = parts[i].split('(');
		functions[name] = code.slice(0, -1); // remove trailing )
	}
	return [parts[0], functions];
};

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

		// Bind instantiation attributes (to the parent, not ourselves)
		if (el !== xelement)
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
		el.propContext = (xelement.propContext || []).slice();

		let prop = getXAttrib(el, 'prop');
		if (prop) {

			// Here we still need to use the inner context of the parent XElement because
			// prop may have variables within it that may need to be resolved.
			bindings.prop(xelement, prop, el, context); // adds a new context to the beginning of the array.

			// Then we add the new context item added by prop();
			context = [context[0], ...el.propContext];
		}
		else
			context = el.propContext.slice();



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

					eval(code);

					// TODO: Make safeEval() work here.  It currently fails bc it has the wrong xelement.
					// Try this again after we redo event binding in initHtml().
					//safeEval.call(xelement, code, {event: event}, true);
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

	var next = el.shadowRoot || el;

	// Recursively unbind children.
	for (let child of next.children) {

		// Change xelement reference as we descend into other xelements.
		// This is needed for test prop.unbindChild()
		if (child instanceof XElement)
			unbindEl(child, child);
		else
			unbindEl(xelement, child);
	}

	// Unbind properties
	if (el.attributes)
		for (let attr of el.attributes) {
			if (attr.name.startsWith('x-') || attr.name.startsWith('data-')) {

				if ((attr.name === 'x-loop' || attr.name === 'data-loop') && el.loopHtml_) {
					el.innerHTML = el.loopHtml_; // revert it back to the look template element.
					delete el.loopHtml_;
					delete el.items_;
					delete el.context_;
					delete el.propContext;
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
			if (item[2])
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

		// If a child of a loop, before loop is initialized.
		if (self.parentNode && getXAttrib(self.parentNode, 'loop')) {
			self.parentNode.loopHtml = self.constructor.html_.trim();
			return false;
		}

		// 1. Create temporary element.
		disableBind++;
		var div = createEl(self.constructor.html_.trim()); // html_ is set from ClassName.html = '...'
		disableBind--;


		// Save definition attributes
		for (let attr of div.attributes)
			self.definitionAttributes[attr.name] = attr.value;

		// 2. Remove and save attributes from instantiation.
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

		// 6. Create children

		// As Shadow DOM
		let mode = self.constructor.shadowMode;
		if (!mode)
			mode = 'open';

		if (mode === 'open' || mode === 'closed') {
			self.attachShadow({mode: mode});
			while (div.firstChild)
				self.shadowRoot.insertBefore(div.firstChild, null);

		}
		else { // mode == 'none'

			// without
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
		}

		var root = self.shadowRoot || self;


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

		self.initialized = true;
	}
};

/**
 * @extends HTMLElement
 * @extends Node
 * @property {HTMLElement} shadowRoot
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

		// Class properties
		this.parent = undefined;
		this.definitionAttributes = {};
		this.instantiationAttributes = {};


		let xname = getXName(this.constructor);
		let self = this;
		if (customElements.get(xname))
			initHtml(self);
		else
			customElements.whenDefined(xname).then(() => {
				initHtml(self);
			});
	}

	/**
	 * TODO: Use this function in more places.
	 * @param expr {string}
	 * @param context {object[]}
	 * @returns {[XElement, string[]][]} Array of arrays, with each sub-array being a root and the path from it.  */
	getWatchedPaths(expr, context) {
		expr = addThis(replaceVars(expr, context), context);
		return parseVars(expr).map(
			(path)=>getRootXElement(this, path)
		);
	}
}



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

		return this.html_ = html.trim();
	}
});

// Exports
XElement.bindings = bindings;
XElement.createEl = createEl; // useful for other code.
XElement.getXParent = getXParent;
XElement.removeProxy = removeProxy;
window.XElement = XElement;

// Used as a passthrough for xelement attrib debugging.
window.xdebug = (a) => {
	debugger;
	return a;
};
window.xlog = (a) => {
	console.log(a);
	return a;
};
})();