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

	// TODO
	//this.remove = function(key) {};
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

export {safeEval}