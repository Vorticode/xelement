# XElement


![header](img\header.jpg)

Pronounced ex-element, XElement is a lightweight JavaScript library making it easy to create HTML user interface components:

```javascript
class Inventory extends XElement {
    addItem() {
        this.items.push({name: '', qty: 0});
    }
}
Inventory.html = `
	<div>
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
	</div>`;

document.body.appendChild(new Inventory());
```

Features:

- Model-View-Vie Model (MVVM) pattern for convenient data binding.
- Only 8KB!
- Zero dependencies--just include xelement.js or xelement.min.js.
- Doesn't take over your whole project.  Use it only where you need it.
- Uses standard html.
- Uses the ShadowDOM by default, so each XElement can have its own styles.

## Basic Use

TODO





## Ids



## Attributes

## Slots

## Data Binding

### Attributes

### Text and Html

### Val

### Visible

### Classes

### Loop



## Events







---

Picture used in header is *Dreaming in Mech*, by Jakub Rozalski.  Minified sizes are depicted.

