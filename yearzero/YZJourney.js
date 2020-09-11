const { Collection } = require('discord.js');
const YZGenerator3 = require('../generators/YZGenerator3');
const YZTerrainTypesFlags = require('./YZTerrainTypesFlags');
const { capitalize, strCamelToNorm } = require('../utils/Util');

/**
 * A Forbidden Lands Journey.
 */
class YZJourney {
	/**
	 * @param {string} filename Filename containing the generator data
	 * @param {Object} [options={}] Options to provide
	 * @param {string} options.season The current season (default is SPRING)
	 * @param {string} options.quarterDay The current Quarter of the Day (default is DAY)
	 * @param {string|string[]} options.terrains Terrain types
	 */
	constructor(filename, options = {}) {
		this.filename = filename;
		this.data = YZGenerator3.parse(filename);

		/**
		 * The current Season of Year.
		 * @type {string}
		 * @see {YZJourney.SEASONS}
		 */
		this.season = 'SPRING';

		// Applies Season from options.
		if (options.season) {
			if (Object.keys(this.constructor.SEASONS).includes(options.season.toUpperCase())) {
				this.season = options.season.toUpperCase();
			}
		}

		/**
		 * The current Quarter of Day.
		 * @param {string}
		 * @see {YZJourney.QUARTER_DAYS}
		 */
		this.quarterDay = 'DAY';

		// Applies Quarter Day from options.
		if (options.quarterDay) {
			if (Object.keys(this.constructor.QUARTER_DAYS).includes(options.quarterDay.toUpperCase())) {
				this.quarterDay = options.quarterDay.toUpperCase();
			}
		}

		/**
		 * The types of terrain.
		 * @type {YZTerrainTypesFlags}
		 */
		this.terrain = new YZTerrainTypesFlags();

		// Applies Terrain from options, or uses default.
		if (typeof options.terrains === 'string') {
			if (Object.keys(YZTerrainTypesFlags.FLAGS).includes(options.terrains.toUpperCase())) {
				this.terrain.add(options.terrains.toUpperCase());
			}
		}
		else if (Array.isArray(options.terrains) && options.terrains.length) {
			options.terrains.forEach(t => {
				if (Object.keys(YZTerrainTypesFlags.FLAGS).includes(t.toUpperCase())) {
					this.terrain.add(t.toUpperCase());
				}
			});
		}
		else {
			this.terrain.add('PLAINS');
		}
	}

	/**
	 * Code of the day (used for the Daylight/Darkness cycle).
	 * @type {number}
	 * @readonly
	 */
	get dayCode() {
		return this.constructor.SEASONS[this.season]
			+ this.constructor.QUARTER_DAYS[this.quarterDay];
	}

	/**
	 * Whether the Journey is performed during daylight.
	 * @type {boolean}
	 * @readonly
	 */
	get inDaylight() {
		return this.constructor.DAYLIGHT[this.dayCode];
	}

	/**
	 * Whether the Journey is performed during darkness.
	 * @type {boolean}
	 * @readonly
	 */
	get inDarkness() {
		return !this.inDaylight;
	}

	/**
	 * Icon for Daylight or Darkness.
	 * @type {string}
	 * @readonly
	 */
	get dayIcon() {
		return this.inDaylight ? '☀️' : '🌘';
	}

	/**
	 * Foraging modifier.
	 * @type {number}
	 * @readonly
	 */
	get forageModifier() {
		return this.constructor.FORAGE_MODIFIER_BY_SEASON[this.season]
			+ this.terrain.modifiers.forage;
	}

	/**
	 * Hunting modifier.
	 * @type {number}
	 * @readonly
	 */
	get huntModifier() {
		return this.terrain.modifiers.hunt;
	}

	/**
	 * Draws a random mishap from the specified activity.
	 * @param {string} activity Activity flag
	 * @returns {string[2]|undefined} [ title, description ] or `false` if not found
	 */
	mishap(activity) {
		// Finds the correct activity.
		const acti = this.constructor.Activities.find((v, k) => {
			return k === activity.toUpperCase() || k.includes(activity.toUpperCase());
		});

		// Exits early if not found or has no Mishap table.
		if (!acti) return undefined;
		if (!acti.mishap) return undefined;

		// Gets the Mishap table.
		const mishapTable = this.data[acti.mishap];

		// Throws an error if the Mishap table wasn't found (should not happen).
		if (!mishapTable) throw new ReferenceError(`YZJourney - Activity mishap table NOT FOUND: "${acti.mishap}"`);

		// Draws and returns a random Mishap.
		return mishapTable.random();
	}

	/**
	 * Journey's generic description.
	 * @returns {string}
	 */
	getDescription() {
		return 'List of available actions:\n`'
			+ YZJourney.Activities
				.array()
				.map(a => strCamelToNorm(a.tag).toUpperCase())
				.join('`, `')
			+ '`';
	}

	/**
	 * Terrain's description.
	 * @returns {string}
	 */
	getTerrainDescription() {
		const lands = this.terrain
			.toArray()
			.map(t => capitalize(t.toLowerCase()));
		const str = '`' + lands.join('`, `') + '\n`'
			+ '*(' + capitalize(this.terrain.modifiers.movement.toLowerCase()) + ')*';
		return str;
	}

	/**
	 * Modifiers' description.
	 * @returns {string}
	 */
	getModifiersDescriptions() {
		const str = (this.inDarkness ? 'Lead the Way: **-2**\n' : '')
			+ `Forage: **${this.forageModifier > 0 ? '+' : ''}${this.forageModifier}**\n`
			+ `Hunt: **${this.huntModifier > 0 ? '+' : ''}${this.huntModifier}**`;
		return str;
	}

	/**
	 * Reactions' description.
	 * @returns {string}
	 *
	getReactionsDescription() {
		let str = 'React to the message to trigger a Mishap table:\n';
		this.constructor.Activities.forEach(acti => {
			if (acti.mishap) str += `\n${acti.icon} : ${this.data[acti.mishap].name}`;
		});
		return str;
	}//*/
}

YZJourney.Activities = new Collection(Object.entries({
	HIKE: {
		tag: 'hike',
		mishap: null,
		icon: null,
	},
	LEADTHEWAY: {
		tag: 'leadTheWay',
		mishap: 'leadingTheWayMishap',
		icon: '🗺️',
		rules: {
			limit: 1,
			restricted: ['KEEPWATCH'],
		},
	},
	KEEPWATCH: {
		tag: 'keepWatch',
		mishap: null,
		icon: null,
		rules: {
			limit: 1,
			restricted: ['LEADTHEWAY'],
		},
	},
	MAKECAMP: {
		tag: 'makeCamp',
		mishap: 'makingCampMishap',
		icon: '⛺',
		rules: {
			restricted: ['HIKE'],
		},
	},
	FORAGE: {
		tag: 'forage',
		mishap: 'foragingMishap',
		icon: '🍇',
		rules: {
			restricted: ['HIKE'],
		},
	},
	HUNT: {
		tag: 'hunt',
		mishap: 'huntingMishap',
		icon: '🏹',
		rules: {
			restricted: ['HIKE'],
		},
	},
	FISH: {
		tag: 'fish',
		mishap: 'fishingMishap',
		icon: '🐟',
		rules: {
			restricted: ['HIKE'],
		},
	},
	REST: {
		tag: 'rest',
		mishap: null,
		icon: null,
		rules: {
			restricted: ['HIKE'],
		},
	},
	SLEEP: {
		tag: 'sleep',
		mishap: null,
		icon: null,
		rules: {
			restricted: ['HIKE'],
		},
	},
	EXPLORE: {
		tag: 'explore',
		mishap: null,
		icon: null,
		rules: {
			restricted: ['HIKE'],
		},
	},
	SEATRAVEL: {
		tag: 'seaTravel',
		mishap: 'seaTravelMishap',
		icon: '⛵',
	},
}));

YZJourney.QUARTER_DAYS = {
	MORNING: 1,
	DAY: 2,
	EVENING: 3,
	NIGHT: 4,
};

YZJourney.SEASONS = {
	SPRING: 10,
	SUMMER: 20,
	AUTUMN: 30,
	WINTER: 40,
};

YZJourney.DAYLIGHT = {
	11: true,
	12: true,
	13: false,
	14: false,
	21: true,
	22: true,
	23: true,
	24: false,
	31: true,
	32: true,
	33: false,
	34: false,
	41: false,
	42: true,
	43: false,
	44: false,
};

YZJourney.FORAGE_MODIFIER_BY_SEASON = {
	SPRING: -1,
	SUMMER: 0,
	AUTUMN: +1,
	WINTER: -2,
};

module.exports = YZJourney;