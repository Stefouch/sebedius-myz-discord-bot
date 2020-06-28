const { Collection } = require('discord.js');
const Util = require('../utils/Util');
const YZInitDeck = require('./YZInitDeck');
const YZCombattant = require('./YZCombat');

module.exports = class InitTracker {

	/**
	 * Creates an Initiative Tracker.
	 * @param {string} name The name for the Combat instance
	 * @param {Discord.Snowflake} id The message's ID
	 */
	constructor(name, id) {
		this.id = id || 0;
		this.name = name || 'Unnamed';
		this.round = 0;
		this.initiative = 0;
		this.initiativeDeck = new YZInitDeck();

		/**
		 * K: init / V: Array<(YZCombattant.id | groupName)>
		 * The initiative is stored as a float number whose decimal helps splitting same init values.
		 * @type {Discord.Collection<number, (Symbol|string)[]>}
		 */
		this.initiatives = new Collection();

		/**
		 * K: YZCombattant.id / V: YZCombattant
		 * @type {Discord.Collection<Symbol, YZCombattant>}
		 */
		this.combattants = new Collection();

		/**
		 * K: groupName / V: YZCombattant.id[]
		 * @type {Discord.Collection<string, Symbol[]>}
		 */
		this.groups = new Collection();
	}

	/**
	 * The values in the initiative list.
	 * @type {string[]}
	 */
	get initiativeValues() {
		return [...this.initiatives.keys()].sort();
	}

	/**
	 * The names of all the groups.
	 * @type {string[]}
	 */
	get groupNames() {
		return [...this.groups.keys()].sort();
	}

	// ---------- INITIATIVES -------------------------------------
	// ============================================================

	/**
	 * Adds a Combattant or a Group to the initiative list.
	 * @param {Symbol|string} ref The Combattant's ID or the group's name
	 * @param {number[]} inits An array of initiative values
	 * @throws {InitError}
	 */
	initAdd(ref, inits) {
		// Validators.
		this.checkRef(ref);
		if (!Array.isArray(inits)) throw new InitError(`Init-Add: "${inits}" are not valid initiatives!`);
		if (!this.combattants.has(ref) && !this.groups.has(ref)) throw new InitError(`Init-Add: "${ref}" does not exist!`);

		// Iterates over all initiative values.
		for (const init of inits) {
			// Validator again.
			if (typeof init !== 'number') throw new InitError(`Init-Add: "${init}" is not a valid initiative!`);
			// Creates the initiative slot if it doesn't exist.
			// Adds a float to avoid duplicates.
			const i = Number.isInteger(init) ? init + 0.05 : init + 0.001;
			if (this.initiatives.has(i)) {
				// Run again if it already exists.
				// It will result in adding extra decimals.
				this.initAdd(ref, [i]);
			}
			else {
				this.initiatives.set(i, ref);
			}
		}
	}

	/**
	 * Changes the initiative for a Combattant or a group.
	 * @param {Symbol|string} ref The Combattant's ID or group's name
	 * @param {number[]} newInits The new initiative values
	 */
	initChange(ref, newInits) {
		this.initRemoveAll(ref);
		this.initAdd(ref, newInits);
	}

	initGet(ref) {
	}

	initEdit(value, newValue) {
	}

	/**
	 * Removes a Combattant or a group from the initiative list.
	 * @param {Symbol|string} ref The Combattant's ID or group's name
	 * @returns {number} The number of times it has been removed (should be 1)
	 */
	initRemoveAll(ref) {
		return this.initiatives.sweep(v => v === ref);
	}

	// ---------- COMBATTANTS -------------------------------------
	// ============================================================

	/**
	 * Create a new Combattant and adds it to the collection.
	 * @param {*} data A YZCombattant object or the data required to create the Combattant
	 * @returns {YZCombattant}
	 */
	create(data) {
		const combattant = data instanceof YZCombattant ? data : new YZCombattant(data);
		this.combattants.set(combattant.id, combattant);
		return combattant;
	}

	/**
	 * Gets a YZCombattant object from the collection bases on its name.
	 * @param {string} name A part of the name
	 * @returns {YZCombattant}
	 */
	find(name) {
		const look = name.toLowerCase();
		return this.combattants.find(c => c.name.toLowerCase().includes(look));
	}

	/**
	 * Edits a Combattant in the collection.
	 * @param {Symbol} cid The Combattant's ID
	 * @param {Object} newData An object containing the properties and their new values
	 * @returns {YZCombattant} The YZCombattant object, or `null` if not found
	 */
	edit(cid, newData) {
		// Validator.
		if (!this.combattants.has(cid)) return null;

		// Gets the Combattant.
		const combattant = this.combattants.gets(cid);
		// Edits the Combattant and saves it in the collection.
		for (const property in newData) {
			if (combattant.hasOwnProperty(property)) {
				combattant[property] = newData[property];
			}
		}
		this.combattants.set(cid, combattant);
		console.log(combattant);
		return combattant;
	}

	/**
	 * Adds a Combattant to the initiative list.
	 * @param {Symbol} cid The Combattant's ID.
	 * @param {?number[]} initiativeValues Predefined initiative values
	 * @returns {boolean} `true` if added
	 */
	add(cid, initiativeValues = null) {
		// Validator.
		if (!this.combattants.has(cid)) return false;

		// Draws initiative.
		const combattant = this.combattants.get(cid);
		const inits = initiativeValues || this.drawInit(combattant.speed);
		this.initAdd(cid, inits);
		return true;
	}

	/**
	 * Removes a Combattant from the initiative list.
	 * @param {Symbol} cid The Combattant's ID
	 * @returns {number} The number of times it has been removed (should be 1)
	 */
	remove(cid) {
		return this.initRemoveAll(cid);
	}

	/**
	 * Moves a Combattant into or outo a group.
	 * @param {Symbol} cid The Combattant's ID
	 * @param {?string} targetGroup Place to move if specified
	 */
	move(cid, targetGroup) {
		// Validators.
		if (!this.combattants.has(cid)) return false;


	}

	/**
	 * Completely erases a Combattant from this Init Tracker.
	 * @param {Symbol} cid The Combattant's ID
	 */
	erase(cid) {
		this.initRemoveAll(cid);
		this.removeFromAllGroups(cid);
		this.combattants.delete(cid);
	}

	// ---------- GROUPS ------------------------------------------
	// ============================================================

	/**
	 * Creates a new group and returns `true`.
	 * If the group already exists, it returns `false` instead.
	 * @param {string} group The name of the group
	 * @param {number} speed The quantity of drawn initiative cards
	 * @returns {boolean}
	 */
	createGroup(group, speed = 1) {
		// Validator.
		if (group.length <= 0) throw new InitError('Create-Group: tried to create an unnamed group!');

		// Checks if the group already exist.
		if (this.groups.has(group)) return false;

		// Otherwise, creates the group.
		this.groups.set(group, []);

		// And draws its initiative.
		const inits = this.drawInit(speed);
		this.initAdd(group, inits);
		return true;
	}

	/**
	 * Deletes a group and removes all Combattants inside.
	 * @param {string} group The group's name
	 * @returns {number} The number of times it has been removed (should be 1)
	 */
	deleteGroup(group) {
		// Validator.
		if (!this.groups.has(group)) return 0;

		// Erases all Combattants in that group.
		this.groups.get(group).forEach(cid => this.combattants.delete(cid));

		// Removes the group from the initiative list.
		const cnt2 = this.initRemoveAll(group);

		// Erases the group.
		const bool1 = this.groups.delete(group);

		return +bool1 + cnt2;
	}

	/**
	 * Adds a Combattant to a group.
	 * The group is created if it didn't exist.
	 * @param {Symbol} cid The Combattant's ID.
	 * @param {string} group The name of the group
	 * @throws {InitError}
	 */
	addToGroup(cid, group) {
		// Validator.
		if (!this.combattants.has(cid)) throw new InitError(`Add-Combattant-To-Group: "${cid}" does not exist!`);

		// Creates the group if it doesn't exist.
		const combattant = this.combattants.get(cid);
		if (!this.groups.has(group)) this.createGroup(group, combattant.speed);

		// Adds the combattant to the group.
		const grp = this.groups.get(group);
		grp.push(cid);
		this.groups.set(group, grp);
	}

	/**
	 * Remove a Combattant from a group and adds it to the initiative order.
	 * @param {Symbol} cid The Combattant's ID.
	 * @param {string} group The name of the group
	 * @returns {boolean} `true` if removed, `false` if not found in group
	 */
	removeFromGroup(cid, group) {
		// Validator.
		if (!this.combattants.has(cid)) return false;
		if (!this.groups.has(group)) return false;

		// Edits the group.
		const grp = this.groups.get(group);
		const index = grp.indexOf(cid);
		if (index > -1) grp.splice(index);

		// Deletes the group if empty.
		if (grp.length <= 0) this.deleteGroup(group);
		else this.groups.set(group, grp);

		return true;
	}

	/**
	 * Remove a Combattant from ALL groups.
	 * @param {Symbol} cid The Combattant's ID
	 * @returns {number} The number of times it has been removed (should be 1)
	 */
	removeFromAllGroups(cid) {
		let count = 0;
		for (const group of this.groupNames) {
			const removed = this.removeFromGroup(cid, group);
			if (removed) count++;
		}
		return count;
	}

	// ---------- OTHER -------------------------------------------
	// ============================================================

	/**
	 * Draws initiative cards.
	 * @param {number} qty The quantity of initiative cards to draw
	 * @return {number[]}
	 */
	drawInit(qty = 1) {
		// Min 1 card, Max 10 cards.
		const drawQty = Util.clamp(qty, 1, 10);

		// If more cards are drawn that the remaining number,
		// draws the remaining cards and shuffle a new deck for the lasts.
		const size = this.initiativeDeck.size;
		let cards;
		if (drawQty <= size) {
			cards = this.initiativeDeck.draw(drawQty);
		}
		else {
			const remainingCards = this.initiativeDeck.draw(size);
			this.initiativeDeck = new YZInitDeck();
			const extraCards = this.drawInit(drawQty - size);
			cards = remainingCards.concat(extraCards);
		}
		// Always returns an array.
		if (!cards) throw new InitError('Cards are null');
		if (!Array.isArray(cards)) return [cards];
		return cards;
	}

	printList() {
		const start = '```markdown\n';
		const title = `Current initiative: ${this.initiative} (round ${this.round})`;
		const end = '\n```';
	}

	/**
	 * Tells if this is a valid Combattant's ID.
	 * @param {Symbol} cid The ID to check
	 * @returns {boolean}
	 */
	isValidCombattantID(cid) {
		const isSymbol = typeof cid === 'symbol';
		if(isSymbol) {
			const descriptor = cid.description;
			const isStringDescriptor = typeof descriptor === 'string';
			if(isStringDescriptor) return descriptor.length === 6;
		}
		return false;
	}

	/**
	 * Tells if this is a valid Initiative ID (Combattant or group).
	 * @param {Symbol|string} ref The ID to check
	 * @returns {boolean}
	 */
	isValidInitReference(ref) {
		return (this.isValidCombattantID(ref) || typeof ref === 'string');
	}

	/**
	 * Checks CID or Die!
	 * @param {Symbol} cid The Combattant's ID
	 * @param {string} fnName The name of the function
	 * @throws {InitError}
	 */
	checkCID(cid, fnName = '') {
		if (!this.isValidCombattantID(cid)) {
			throw new InitError(`${fnName}: "${cid}" is not a valid Combattant's ID!`);
		}
	}

	/**
	 * Checks reference or Die!
	 * @param {Symbol} ref The Combattant's ID or the group's name
	 * @param {string} fnName The name of the function
	 * @throws {InitError}
	 */
	checkRef(ref, fnName = '') {
		if (!this.isValidInitReference(ref)) {
			throw new InitError(`${fnName}: "${ref.toString()}" is not a valid ID!`);
		}
	}

	/**
	 * Strip initiative from its decimals.
	 * @param {number} init The initiative to round
	 * @returns {number[]} [1]: init rounded / [2]: decimals
	 */
	stripInitiative(init) {
		const rounded = Math.ceil(init);
		const decimal = init - rounded;
		return [rounded, decimal];
	}
};

class InitError extends Error {
	constructor(message) {
		super(message);
		this.name = 'InitError';
	}
}