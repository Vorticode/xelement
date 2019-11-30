# XElement

**WARNING: This project is in alpha and is not yet ready for use.**

![header](img/header.jpg)

XElement  is a lightweight JavaScript library making it easy to create HTML user interface components:

```html
<template id="Inventory">
	<style>
        :host { border: 1px solid black } // styles whole element.
        input { width: 10em }
    </style>
    <button onclick="addItem()">Add Item</button>
    <div data-loop="items:item">
        <div>
            <input data-val="item.name">
            <input data-val="item.qty">
        </div>
    </div>
</template>

<script>
class Inventory extends XElement {
    addItem() {
        this.items.push({name: '', qty: 0});
    }
}
Inventory.html = '#Inventory';
</script>
<x-inventory></x-inventory>
```

Features:

- Model-View-Vie Model (MVVM) pattern for convenient data binding.
- Only **8KB** minified!  Or smaller when gzipped.
- Zero dependencies.  Just include xelement.js or xelement.min.js.
- Doesn't take over your whole project.  Use it only where you need it.
- Uses standard html.  No need to learn a templating language.
- Uses ShadowDOM by default, so each XElement can have its own styles.

## Basic Use

In this minimal example, we make a new class called Hello and set its html.  Any class that extends XElement automatically creates a new html tag with a name of "x-" plus the lower case version of the class name.

```html
<script src="xelement.js"></script>
<script>
	class Hello extends XElement {}
    Hello.html = `<div>Hello XElement!</div>`;
}
</script>

<!-- Prints an element with textContent = "Hello XElement!" -->
<x-hello></x-hello>
```

An XElement can also be instantiated with the new keyword:

```javascript
var hello = new Hello();
document.body.appendChild(hello);
```

If the html property is set to a valid css selector, XElement will pull its html from that element.  This can be useful if using an IDE that don't support syntax highlighting html inside of strings.

```html
<template id="hello">Hello XElement!</template>

<script>
	class Hello extends XElement {}
    HelloWorld.html = '#hello';
}
</script>
```

XElements can also be embedded within the html of other XElements:

```javascript
class Wheel extends XElement {}
Wheel.html = '<div>O</div>';

class Car extends XElement {}
Car.html = `
	<div>
		<x-wheel></x-wheel>
        <x-wheel></x-wheel>
        <x-wheel></x-wheel>
        <x-wheel></x-wheel>
	</div>`;
```

## Ids

Any element in the html with an id is automatically bound to a property with the same name on the class instance:

```javascript
class Car extends XElement {}
Car.html = `
	<div>
		<input id="driver">
	</div>`;

var car = new Car();
car.driver.value = 'Chuck Norris'; // Puts text in input box.
car.driver = 3; // Error, property is read-only.
```

## Attributes

TODO

## Slots

## Data Binding

XElement performs data-binding with any element that has an attribute name with the *data-* prefix.

### Attributes

### Text and Html

### Val

### Visible

### Classes

### Loop



## Events





## Missing / Future Features

- XElement can only bind to JavaScript variables names that use standard ascii.
- Performance improvements
- More data- binding attributes.
- Support for non-beta versions of Microsoft Edge.



---

Picture used in header is *Dreaming in Mech*, by Jakub Rozalski.  Minified sizes are depicted.

