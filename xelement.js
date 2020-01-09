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
var arrayEq = (array1, array2) => {
	if (array1.length !== array2.length)
		return false;

	array2 = array2.$removeProxy || array2;
	return (array1.$removeProxy || array1).every((value, index) => eq(value, array2[index]))
};

var eq = (item1, item2) => {
	return (item1.$removeProxy || item1) === (item2.$removeProxy || item2);
};



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
	if ((name.startsWith('data-') || el.hasAttribute(name)) ||
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
var parentIndex = (el) => !el.parentNode ? 0 : Array.prototype.indexOf.call(el.parentNode.children, el);

/**
 * @param obj {object}
 * @param path {string[]}
 * @param create {boolean=false} Create the path if it doesn't exist.
 * @param value {*=} If not undefined, set the object's path field to this value. */
var traversePath = (obj, path, create, value) => {
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
		if (last && value !== undefined)
			obj[srcProp] = value;

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





/**
 * Evaluate expr, but allow undefined variables.
 * @param expr {string}
 * @returns {*} */
function safeEval(expr) {
	try {
		return eval(expr);
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
			// TODO: allow some nonvars if in brackets.
			keepGoing = (allowCall || !matches[0].endsWith('(')) && !nonVars.includes(matches[1]);
			if (keepGoing) {

				// fitler() removes undefineds from matches.
				// This lets us get the first non-undefiend parenthetical submatch.
				let item = matches.filter(Boolean)[1];

				// Add varible property to current path
				if (includeThis || item !== 'this') {
					currentVar.push(item);
					currentVar.index_.push(index);
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

/**
 * TODO: this function should leave alone anything after a :
 * @param code {string}
 * @param replacements {object<string, string>}
 * @returns {string} */
var replaceVars = (code, replacements) => {
	var paths = parseVars(code, 1);
	for (let path of paths.reverse()) // We loop in reverse so the replacement indices don't get messed up.
		for (let oldVar in replacements) {
			if (path.length >= 1 && path[0] === oldVar)
				// replacements[oldVar] is newVar.
				code = code.slice(0, path.index_[0]) + replacements[oldVar] + code.slice(path.index_[0] + oldVar.length);
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
	let pieces = code.split(/\s*;\s*/g);
	for (let piece of pieces) {
		let [key, value] = piece.split(/\s*:\s*/);
		result[key] = value;
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
			var proxyObj = ProxyObject.get_(obj);
			var proxyResult = ProxyObject.get_(result, proxyObj.roots_);

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
			//if (field !== 'length') {

				// Don't allow setting proxies on underlying obj.
				// This removes them recursivly in case of something like newVal=[Proxy(obj)].
				obj[field] = removeProxies(newVal);

				let path = [...proxyObj.getPath_(root), field];
				root.notify_('set', path, obj[field]);
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

// Array operations that send multiple notifications.
var ArrayMultiOps = ['push', 'pop', 'splice', 'shift', 'sort', 'reverse', 'unshift'];

// One of these will exist for each object, regardless of how many roots it's in.
class ProxyObject {
	constructor(obj, roots) {

		/**
		 * Not used.
		 * \@type object */
		//this.object = obj;

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
		if (Array.isArray(this.proxy_)) {

			// Because this.proxy_ is a Proxy, we have to replace the functions
			// on it in this special way by using Object.defineProperty()
			// Directly assigning this.proxy_.indexOf = ... calls the setter and leads to infinite recursion.
			for (let func of ['indexOf', 'lastIndexOf', 'includes']) // TODO: Support more array functions.

				Object.defineProperty(this.proxy_, func, {
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

			for (let func of ArrayMultiOps)
				Object.defineProperty(this.proxy_, func, {
					get: function() {
						// Return a new indexOf function.
						return function () {
							if (ProxyObject.currentOp) {
								return Array.prototype[func].apply(obj, arguments);
							} else {
								ProxyObject.currentOp = func;
								var result = Array.prototype[func].apply(self.proxy_, arguments);
								delete ProxyObject.currentOp;

								for (let callback of ProxyObject.whenOpFinished)
									callback();
								ProxyObject.whenOpFinished = new Set();

								return result;
							}
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
	 * @param roots {object[]=} Roots to add to new or existing object.
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

ProxyObject.whenOpFinished = new Set();

// TODO: Could this be replaced with a weakmap from the root to the callbacks?
// Yes, but it wouldn't be as clean.
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
	var proxyRoot = ProxyRoot.get_(root);
	proxyRoot.callbacks_.push(callback);
	return proxyObjects.get(root).proxy_;
};;



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
				if (v !== t) {
					//watchlessSet(obj, [name], v);
					// obj.$removeProxy[name] = v;  This should let us remove watchlessSet, but it doesn't work.

					obj = obj.$removeProxy || obj;
					let wp = watched.get(obj);
					let node = wp ? wp.fields_ : obj;
					node[name] = v
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
		this.subs_ = {};
	}

	/**
	 * When a property or sub-property changes, notify its subscribers.
	 * @param action {string}
	 * @param path {string[]}
	 * @param value {*=} */
	notify_(action, path, value) {

		// Traverse up the path looking for anything subscribed.
		let parentPath = path.slice(0, -1);
		let cpath = csv(path);
		while (parentPath.length) {
			let cpath = csv(parentPath); // TODO: This seems like a lot of work for any time a property is changed.

			if (cpath in this.subs_)
				for (let callback of this.subs_[cpath])
					callback.apply(this.obj_, arguments) // "this.obj_" so it has the context of the original object.
			parentPath.pop();
		}

		// Traverse to our current level and downward looking for anything subscribed
		for (let name in this.subs_)
			if (name.startsWith(cpath))
				for (let callback of this.subs_[name])
					callback.apply(this.obj_, arguments); // "this.obj_" so it has the context of the original object.
	}

	/**
	 *
	 * @param path {string|string[]}
	 * @param callback {function((action:string, path:string[], value:string?)} */
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
/*
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
		node = node.$removeProxy || node;
	}

	return node[prop] = val;
};
*/;

/*
Inherit from XElement to create custom HTML Components.

TODO: next goals:
indexOf and includes() on arrays fail because they compare proxied objects.
allow sortable?
rename data-bind to data-prop
Make data- prefix optional.  Use "x-", ":", or no prefix?
{{var}} in text and attributes
Fix failing Edge tests.
allow comments in loops.
x-elements in loops get fully initialized then replaced.




warning on data-prop wrong order.
TODO
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
Expose bindings prop in minified version.
non-ascii variable names.
throttle, debounce? data-val only trigger on change.  Via :attributes?
Auto two-way bind for simple variables?
bind to <input type="file">
bind to clipboard events
Named slot support? - https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_templates_and_slots
Separate out a lite version that doesn't do binding?
	This would also make the code easier to follow.  But what to call it?  XEl ? XElementLite?
TODO:
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
 * @type {WeakMap<HTMLElement, {path_:string, callback_:function}[]>} */
var elWatches = new WeakMap();
var addElWatch = (el, path, callback) => {
	let we = elWatches.get(el);
	if (!we)
		elWatches.set(el, we = []);
	we.push({path_: path, callback_: callback});
};


/**
 * A map between elements and the events assigned to them. *
 * @type {WeakMap<HTMLElement, *[]>} */
var elEvents = new WeakMap();

/**
 *
 * @param el {HTMLElement}
 * @param eventName {string}
 * @param callback {function}
 * @param originalEventAttrib {string} */
var addElEvent = (el, eventName, callback, originalEventAttrib, root) => {
	let ee = elEvents.get(el);
	if (!ee)
		elEvents.set(el, ee = []);
	ee.push([eventName, callback, originalEventAttrib, root]);
};


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
 * Recursively process all the data- attributes in el and its descendants.
 * @param self {XElement}
 * @param el {HTMLElement}
 * @param context {object<string, string>=} A map of loop variable names to their absolute reference.
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


var bindElProps = (self, el, context) => {

	// Seach attributes for data- bindings.
	if (el.attributes) // shadow root has no attributes.
		for (let attr of el.attributes) {
			if (attr.name.startsWith('data-')) {

				let attrName = attr.name.slice(5); // remove data- prefix.

				if (bindings[attrName]) // attr.value is code.
					bindings[attrName](self, attr.value, el, context);

				//#IFDEV
				else
					throw new Error (attrName);
				//#ENDIF
			}
		}

	// Allow traversing from host element into its own shadowRoot
	// But not into the shadow root of other elements.
	let next = el===self && el.shadowRoot ? el.shadowRoot : el;

	// Data loop already binds its own children when first applied.
	if (!el.hasAttribute('data-loop'))
		for (let child of next.children)
			bindElProps(self, child, context);
};




/**
 * We rebind event attributes because otherwise there's no way
 * to make them call the class methods.
 * @param self {XElement}
 * @param el {HTMLElement}
 * @param context {object<string, string>=}
 * @param recurse {boolean=false}
 * @param getAttributesFrom {HTMLElement=} */
var bindElEvents = (self, el, context, recurse, getAttributesFrom) => {

	if (el.getAttribute) { // if not document fragment
		getAttributesFrom = getAttributesFrom || el;

		for (let eventName of eventNames) {
			let originalEventAttrib = getAttributesFrom.getAttribute('on' + eventName);
			if (originalEventAttrib) {

				let code = replaceVars(originalEventAttrib, context);

				// If it's a simple function that exists in the class,
				// add the "this" prefix.
				let path = parseVars(code, 0, 1)[0];
				if (path && traversePath(self, path) instanceof Function)
					code = addThis(code, context, isStandaloneCall);

				// The code in the attribute can reference:
				// 1. event, assigned to the current event.
				// 2. this, assigned to the class instance.
				let callback = function (event) {
					eval(code);
				}.bind(self);
				el.addEventListener(eventName, callback);
				addElEvent(el, eventName, callback, originalEventAttrib, self);

				// Remove the original version so it doesn't also fire.
				el.removeAttribute('on' + eventName);
			}
		}
	}

	if (recurse) {
		let next = el === self && el.shadowRoot ? el.shadowRoot : el;

		// data-loop handles its own children.
		if (!next.getAttribute || !next.hasAttribute('data-loop'))
			for (let child of next.children)
				bindElEvents(self, child, context, true);
	}
};




/**
 * Unbind properties and events from the element.
 * @param self {XElement|HTMLElement}
 * @param el {HTMLElement=} Remove all bindings within root and children. Defaults to self. */
var unbindEl = (self, el) => {
	el = el || self;

	// Only go into shadowroot if coming from the top level.
	// This way we don't traverse into the shadowroots of other XElements.
	var next = self===el && el.shadowRoot ? el.shadowRoot : el;

	// Recursively unbind children.
	for (let child of next.children)
		unbindEl(self, child);

	// Unbind properties
	if (el.attributes)
		for (let attr of el.attributes) {
			if (attr.name.startsWith('data-')) {

				if (attr.name === 'data-loop' && el.loopHtml_) {
					el.innerHTML = el.loopHtml_; // revert it back to the look template element.
					delete el.loopHtml_;
					delete el.items_;
				}

				let watchedEl = elWatches.get(el);
				if (watchedEl)
					for (let sub of watchedEl) {
						var p = p || getXParent(el) || self; // only getXParent when first needed.
						unwatch(p, sub.path_, sub.callback_);
					}
			}
		}

	// Unbind events
	let ee = elEvents.get(el) || [];
	for (let item of ee) { //  item is [event:string, callback:function, originalCode:string, root:XElement]

		// Only unbind if it was bound from the same root.
		// This is needed to allow onclick="" attributes on both the definition and instantiation of an element,
		// and having their "this" bound to themselves or the parent element, respectively.
		if (item[3] === self) {
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
			(function(){ // Guard scope before calling eval.
				value = eval(value.slice(1, -1)); // code to eval
			}).call(self); // Import "self" as "this" variable to eval'd code.  This lets us pass attribute="${this}" in html initialization.
		}
		else
			self[name] = value;
	}

	// Copy attribute as an attribute.
	else
		self.setAttribute(name, value);
};


var initHtml = (self) => {

	if (!self.init_) {

		self.init_ = 1;

		//#IFDEV
		if (!self.constructor.html_)
			throw new XElementError('XElement .html property must be set to a non-empty string.');
		//#ENDIF

		// 1. Create temporary element.
		var div = createEl(self.constructor.html_.trim()); // html_ is set from ClassName.html = '...'

		// 2. Remove and save attributes from instantiation.
		var attributes = {};
		for (let attr of self.attributes) // From instantiation.
			attributes[attr.name] = attr.value;

		// 3.  Add attributes from definition (Item.html='<div attr="value"')
		for (let attr of div.attributes) { // From definition
			if (attr.name)
				setAttribute(self, attr.name, attr.value);
		}

		// 4. Bind events on the defintion to functions on its own element and not its container
		bindElEvents(self, self, null, false, div);

		// 5.  Add attributes from instantiation.
		for (let name in attributes) // From instantiation
			setAttribute(self, name, attributes[name]);

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
				set: () => {
					//#IFDEV
					throw new XElementError('Property ' + id + ' not writable');
					//#ENDIF
				}
			});

			// Only leave the id attributes if we have a shadow root.
			// Otherwise we'll have duplicate id's in the main document.
			if (!self.shadowRoot)
				node.removeAttribute('id');
		}


		// 8. Bind all data- and event attributes
		// TODO: Move bind into setAttribute above, so we can call it separately for definition and instantiation?
		bindElProps(self, self);


		// We pass root to bind all events on this element's children.
		// We bound events on the element itself in a separate call to bindElEvents(self, self) above.
		bindElEvents(self, root, null, true);
	}
};

/**
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

			let setAttr = function (/*action, path, value*/) {
				var result = safeEval.call(self, attrExpr);
				if (result === false || result === null || result === undefined)
					el.removeAttribute(name);
				else
					el.setAttribute(name, result + '');

			}.bind(self);

			// If the variables in code, change, execute the code.
			// Then set the attribute to the value returned by the code.
			for (let path of parseVars(attrExpr)) {
				watch(self, path, setAttr);
				addElWatch(el, path, setAttr);
			}

			setAttr();
		}
	},


	/**
	 * @param self {XElement}
	 * @param code {string}
	 * @param el {HTMLElement}
	 * @param context {object<string, string>} */
	prop: (self, code, el, context) => {
		// allow binding only on XElement
		if (self !== el && el instanceof XElement) {

			var obj = parseObj(code);
			for (let prop in obj) {

				let expr = addThis(replaceVars(obj[prop], context), context);
				let updateProp = (action, path, value) => {
					el[prop] = safeEval.call(self, expr);
				};

				// Set initial values.
				updateProp();

				// If binding to the parent, "this", we need to take extra steps,
				// because normally we can only bind to object properties and not the object itself.
				if (expr === 'this') {

					// 1. We get the subscriptions that watch the property on el.
					let subs = watched.get(el).subs_;

					for (let sub in subs) {
						if (sub.startsWith('"' + prop + '"')) {
							let subPath = JSON.parse('[' + sub + ']');

							// 2. For each function, we move the watch from the child object to the parent object.
							for (let callback of subs[sub]) {
								unwatch(el, subPath, callback);
								watch(self, subPath.slice(1), function (action, path, value) {
									// 3. And intercept its call to make sure we pass the original path.
									callback.apply(el, arguments);
								});
							}
						}
					}
				}

				// Add a regular watch.
				else
					for (let path of parseVars(expr))
						watch(self, path, updateProp);
			}
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
			let updateClass = () => {
				let result = safeEval.call(self, classExpr);
				if (result)
					el.classList.add(name);
				else {
					el.classList.remove(name);
					if (!el.classList.length) // remove attribute after last class removed.
						el.removeAttribute('class');
				}
			};


			// Create properties and watch for changes.
			for (let path of parseVars(classExpr)) {
				//traversePath(self, path, true); // Create properties.
				watch(self, path, updateClass);
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
		let setText = (/*action, path, value*/) => {
			el.textContent = safeEval.call(self, code);
		};
		for (let path of parseVars(code)) {
			watch(self, path, setText);
			addElWatch(el, path, setText);
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
		let setHtml = (/*action, path, value*/) => {
			el.innerHTML = safeEval.call(self, code);
		};

		for (let path of parseVars(code)) {
			watch(self, path, setHtml);
			addElWatch(el, path, setHtml);
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

		context = {...context}; // copy, because we add to it as we descend.

		// Parse code into foreach parts
		var [foreach, loopVar, indexVar] = parseLoop(code);
		foreach = replaceVars(foreach, context);
		foreach = addThis(foreach, context);

		// Allow loop attrib to be applied above shadowroot.
		el = el.shadowRoot || el;

		var rebuildChildren = (action, path, value) => {

			// If we splice off the first item from an array, rebuildChildren() is called every time
			// element n+1 is assigned to slot n.  splice() then sets the array's .length property at the last step.
			// So we only rebuild the children after this happens.
			if (ArrayMultiOps.includes(ProxyObject.currentOp)) {
				ProxyObject.whenOpFinished.add(rebuildChildren);
				return;
			}
		
			// The code we'll loop over.
			// We store it here because innerHTML is lost if we unbind and rebind.
			if (!el.loopHtml_) {
				el.loopHtml_ = el.innerHTML.trim();

				// Remove children before calling rebuildChildren()
				// That way we don't unbind elements that were never bound.
				while (el.lastChild)
					el.removeChild(el.lastChild);
			}

			//#IFDEV
			if (!el.loopHtml_)
				throw new XElementError('Loop "' + code + '" rebuildChildren() called before bindEl().');
			//#ENDIF

			var newItems = removeProxies(safeEval.call(self, foreach) || []);
			var oldItems = removeProxies(el.items_ || []);

			if (arrayEq(oldItems, newItems))
				return;

			// Set temporary index on each child, so we can track how they're re-ordered.
			for (let i in Array.from(el.children))
				el.children[i].index_ = i;

			// Create a map from the old items to the elements that represent them.
			var oldMap = new Map();
			var newSet = new Set(newItems);
			for (let i=oldItems.length-1; i>=0; i--) {
				let oldItem = oldItems[i];
				let child = el.children[i];

				// And remove any elements that are no longer present.
				if (!newSet.has(oldItem)) {
					unbindEl(child);
					el.removeChild(child);
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
				let oldChild = el.children[i];
				let newChild = (oldMap.get(newItems[i]) || []).pop(); // last on, first off b/c above we iterate in reverse.
				let isNew = !newChild;

				// If the existing child doesn't match the new item.
				if (!oldChild || oldChild !== newChild) {

					// Create a new one if needed.
					// TODO: createEl() binds nexted x-elements before we're ready for them to be bound.
					// E.g. below we set the localContext for loop variables.
					if (isNew)
						newChild = createEl(el.loopHtml_);

					// This can either insert the new one or move an old one to this position.
					el.insertBefore(newChild, oldChild);
				}
			}

			// If there are identical items in the array, some extras can be left at the end.
			for (let i=oldItems.length-1; i>=newItems.length; i--) {
				let child = el.children[i];
				if (child) {
					unbindEl(child);
					el.removeChild(child);
				}
			}

			let localContext = {...context};
			//#IFDEV
			if (loopVar in localContext)
				throw new XElementError('Loop variable "' + loopVar + '" already used in outer loop.');
			if (indexVar && indexVar in localContext)
				throw new XElementError('Loop index variable "' + indexVar + '" already used in outer loop.');
			//#ENDIF

			// Rebind events on any elements that had their index change.
			for (let i in Array.from(el.children)) {
				let child = el.children[i];
				if (child.index_ !== i) {

					unbindEl(self, child);

					localContext[loopVar] = foreach + '[' + i + ']';
					if (indexVar !== undefined)
						localContext[indexVar] = i;

					bindEl(self, child, localContext);

					
					// Alt version that makes some things fail:
					// Operates within the child.
					//bindEl(child, child, localContext);
					// Operates on the child's attributes within self.  E.g. data-prop
					//bindEl(self, child, localContext);
				}
				delete child.index_;
			}


			el.items_ = newItems.slice(); // copy
		};



		for (let path of parseVars(foreach)) {
			watch(self, path, rebuildChildren);
			addElWatch(el, path, rebuildChildren);
		}

		// Set initial children
		rebuildChildren();
	},

	// Requires Sortable.js
	// does not support dynamic (watch) binding.
	sortable: (self, code, el, context) => {
		var obj = parseObj(code);
		var result = {};

		// If sorting items bound to a loop, and the variable is standaline,
		// then update the original array after items are dragged.
		var loopCode = el.getAttribute('data-loop');
		if (loopCode) {

			let [foreach] = parseLoop(loopCode);
			if (isStandaloneVar(foreach)) {
				foreach = addThis(replaceVars(foreach, context), context);
				let path = parseVars(foreach);

				result.onSort = function (event) { // Reorder the variables array when items are dragged.
					let array = safeEval.call(self, foreach);
					var item = array[event.oldIndex];
					var variables = [...self.variables.slice(0, event.oldIndex), ...array.slice(event.oldIndex + 1)];
					variables = [...variables.slice(0, event.newIndex), item, ...variables.slice(event.newIndex)];

					traversePath(self, path, true, variables);
				};
			}
		}

		// Build arguments to sendn to Sortable.
		for (let name in obj) {
			let expr = addThis(replaceVars(obj[name], context), context);
			result[name] = safeEval.call(self, expr);
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

		let setVal = (/*action, path, value*/) => {
			let result = safeEval.call(self, code);

			if (el.type === 'checkbox')
				// noinspection EqualityComparisonWithCoercionJS
				el.checked = result == true;
			else
				el.value = result;
		};

		// Update input value when object property changes.
		for (let path of paths) {
			watch(self, path, setVal);
			addElWatch(el, path, setVal);
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
			el.style.display = safeEval.call(self, code) ? displayNormal : 'none';
		};

		for (let path of parseVars(code)) {
			watch(self, path, setVisible);
			addElWatch(el, path, setVisible);
		}

		// Set initial value.
		setVisible();
	},

	/*
	'style': function(self, field, el) {}, // Can point to an object to use for the style.
	'if': function(self, field, el) {}, // Element is created or destroyed when data-if="code" evaluates to true or false.
	'sortable': // TODO use sortable.js and data-sortable="{sortableOptionsAsJSON}"
	*/
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