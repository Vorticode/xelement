/**
 * A WeakMap with multiple values per key. */
var WeakMultiMap = function () {

	let self = this;
	self.items = new WeakMap();

	/**
	 * Add an item to the map.  If it already exists, add another at the same key.
	 * @param key
	 * @param value */
	self.add = function (key, value) {
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
	self.get = function (key) {
		return self.items.get(key)[0];
	};

	self.getAll = function (key) {
		return self.items.get(key) || [];
	};

	// remove last item added.
	self.remove = function (key) {
		let itemSet = self.items.get(key);
		if (!itemSet)
			return undefined;
		if (itemSet.length === 1) // remove on last item
			self.items.delete(key);
		return itemSet.pop();
	};

	self.removeAll = function (key) {
		return self.items.delete(key);
	}

};
export {WeakMultiMap};










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