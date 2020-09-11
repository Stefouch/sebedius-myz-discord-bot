const { BitField } = require('discord.js');

/**
 * Data structure that makes it easy to interact with a TerrainTypes flags bitfield.
 * @extends {BitField}
 */
class YZTerrainTypesFlags extends BitField {

	/**
	 * Gets the modifiers that applies to the terrain.
	 * @type {YZTerrainTypesFlagsModifiers}
	 * @readonly
	 *
	 * @typedef {Object} YZTerrainTypesFlagsModifiers
	 * @property {string} movement Movement restrictions
	 * @property {number|string} hunt Hunting modifier
	 * @property {number|string} forage Foraging modifier
	 */
	get modifiers() {
		return this.toArray()
			.map(t => this.constructor.Modifiers[t])
			.reduce((sum, t) => {
				if(this.constructor.TERRAIN_MOVEMENTS[t.movement]
					> this.constructor.TERRAIN_MOVEMENTS[sum.movement]) {
					sum.movement = t.movement;
				}
				sum.forage += t.forage;
				sum.hunt += t.hunt;
				return sum;
			}, {
				movement: 'OPEN',
				forage: 0,
				hunt: 0,
			});
	}
}

/**
 * Numeric terrain type flags. All available properties:
 * * `PLAINS`
 * * `FOREST`
 * * `DARKFOREST`
 * * `HILLS`
 * * `MOUTAINS`
 * * `HIGHMOUNTAINS`
 * * `LAKE`
 * * `RIVER`
 * * `MARSHLANDS`
 * * `QUAGMIRE`
 * * `RUINS`
 */
YZTerrainTypesFlags.FLAGS = {
	PLAINS: 1 << 1,
	FOREST: 1 << 2,
	DARKFOREST: 1 << 3,
	HILLS: 1 << 4,
	MOUTAINS: 1 << 5,
	HIGHMOUNTAINS: 1 << 6,
	LAKE: 1 << 7,
	RIVER: 1 << 8,
	MARSHLANDS: 1 << 9,
	QUAGMIRE: 1 << 10,
	RUINS: 1 << 11,
};

YZTerrainTypesFlags.Modifiers = {
	PLAINS: {
		movement: 'OPEN',
		forage: -1,
		hunt: +1,
	},
	FOREST: {
		movement: 'OPEN',
		forage: +1,
		hunt: +1,
	},
	DARKFOREST: {
		movement: 'DIFFICULT',
		forage: -1,
		hunt: 0,
	},
	HILLS: {
		movement: 'OPEN',
		forage: 0,
		hunt: 0,
	},
	MOUTAINS: {
		movement: 'DIFFICULT',
		forage: -2,
		hunt: -1,
	},
	HIGHMOUNTAINS: {
		movement: 'IMPASSABLE',
		forage: NaN,
		hunt: NaN,
	},
	LAKE: {
		movement: 'REQUIRES_BOAT_OR_RAFT',
		forage: NaN,
		hunt: 0,
	},
	RIVER: {
		movement: 'REQUIRES_BOAT_OR_RAFT',
		forage: NaN,
		hunt: 0,
	},
	MARSHLANDS: {
		movement: 'REQUIRES_RAFT',
		forage: +1,
		hunt: -1,
	},
	QUAGMIRE:  {
		movement: 'DIFFICULT',
		forage: -1,
		hunt: 0,
	},
	RUINS:  {
		movement: 'DIFFICULT',
		forage: -2,
		hunt: -1,
	},
};

YZTerrainTypesFlags.TERRAIN_MOVEMENTS = {
	OPEN: 1,
	DIFFICULT: 2,
	REQUIRES_RAFT: 3,
	REQUIRES_BOAT_OR_RAFT: 4,
	IMPASSABLE: 5,
};

module.exports = YZTerrainTypesFlags;