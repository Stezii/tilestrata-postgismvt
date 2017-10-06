var pg = require('pg');
var zlib = require('zlib');
const SQL = require('sql-template-strings');

module.exports = function(options) {

	var pgPool;
	var lyr;

	/**
	 * Initializes the layer config and the PostgreSQL datasource.
	 *
	 * @param {TileServer} server
	 * @param {function} callback(err, fn)
	 * @return {void}
	 */
	function initialize(server, callback) {
		lyr = options.lyr;
		pgPool = new pg.Pool(options.pgConfig);
		pgPool.on('error', function (err, client) {
		  console.error(err.message, err.stack);
			var err = new Error('idle client error');
			err.statusCode = 500;
			callback(err);
		});
		if ((lyr.mode === 'cluster' || lyr.mode === 'cluster_fields' || (typeof lyr.mode === 'function')) && lyr.type != 'circle') {
			var err = new Error('Clustering and mode functions can only be used in conjunction with point data');
			err.statusCode = 422;
			callback(err);
		} else {
			callback(null);
		}
	}

	/**
	 * Creates a tile and returns the result as a Mapbox Vector Tile,
	 * plus the headers that should accompany it.
	 *
	 * @param {TileServer} server
	 * @param {TileRequest} tile
	 * @param {function} callback(err, buffer, headers)
	 * @return {void}
	 */
	function serveMVT(server, tile, callback) {
		if (tile.z < lyr.minZoom || tile.z > lyr.maxZoom) {
			err = new Error('Request out of zoom level bounds');
			err.statusCode = 204;
			return callback(err);
		}

		var fields = lyr.fields ? ', ' + lyr.fields.split(' ') : '';
		var clip_geom = (lyr.buffer > 0) ? true : false;
		var resolution = (typeof lyr.resolution === 'function') ? lyr.resolution(server, tile) : lyr.resolution;
		var mode = (typeof lyr.mode === 'function') ? lyr.mode(server, tile) : lyr.mode;

		var query;
		switch (mode) {

			case "cluster":
				var agg_q_name = 'mvt_geo';
				query = `
					SELECT ST_AsMVT(q, '${tile.layer}', ${resolution}, 'geom') AS mvt FROM (
						WITH ${agg_q_name} AS (
							SELECT 1 cnt, ST_AsMVTGeom(ST_Transform(${lyr.table}.${lyr.geometry}, 3857), TileBBox(${tile.z}, ${tile.x}, ${tile.y}, 3857), ${resolution}, ${lyr.buffer}, ${clip_geom}) geom
							FROM ${lyr.table}
							WHERE ST_Intersects(TileBBox(${tile.z}, ${tile.x}, ${tile.y}, ${lyr.srid}), ${lyr.table}.${lyr.geometry})
						)
						SELECT COUNT(${agg_q_name}.cnt), ${agg_q_name}.geom
						FROM ${agg_q_name}
						GROUP BY ${agg_q_name}.geom
					) AS q
				`;
				break;

			case "cluster_fields":
				var agg_q_name = 'mvt_geo';
				var fieldsAgg = '';
				if (lyr.fields) {
					lyr.fields.split(' ').forEach(function(field) {
						fieldsAgg += ', string_agg('+agg_q_name+'.' + field + '::text, \',\') AS ' + field;
					});
				}
				query = `
				SELECT ST_AsMVT(q, '${tile.layer}', ${resolution}, 'geom') AS mvt FROM (
					WITH ${agg_q_name} AS (
						SELECT 1 cnt, ST_AsMVTGeom(ST_Transform(${lyr.table}.${lyr.geometry}, 3857), TileBBox(${tile.z}, ${tile.x}, ${tile.y}, 3857), ${resolution}, ${lyr.buffer}, ${clip_geom}) geom ${fields}
						FROM ${lyr.table}
						WHERE ST_Intersects(TileBBox(${tile.z}, ${tile.x}, ${tile.y}, ${lyr.srid}), ${lyr.table}.${lyr.geometry})
					)
					SELECT COUNT(${agg_q_name}.cnt), ${agg_q_name}.geom ${fieldsAgg}
					FROM ${agg_q_name}
					GROUP BY ${agg_q_name}.geom
				) AS q
				`;
				break;

				default:
					query = `
						SELECT ST_AsMVT(q, '${tile.layer}', ${resolution}, 'geom') AS mvt FROM (
                            WITH a AS (
							SELECT ST_AsMVTGeom(
                                ST_Transform(${lyr.table}.${lyr.geometry}, 3857),
                                TileBBox(${tile.z}, ${tile.x}, ${tile.y}, 3857),
                                ${resolution},
                                ${lyr.buffer},
                                ${clip_geom} ) geom ${fields}
							FROM ${lyr.table}
							WHERE ST_Intersects(TileBBox(${tile.z}, ${tile.x}, ${tile.y}, ${lyr.srid}), ${lyr.table}.${lyr.geometry})
                            )
                            SELECT * FROM a WHERE geom IS NOT NULL
						) AS q
					`;
					break;
		}

		pgPool.query(query, function(err, result) {
			if (err) {
				console.log(query, err.message, err.stack)
				var err = new Error('An error occurred');
				err.statusCode = 500;
				return callback(err);
			}
			if (!result.rows[0].mvt) {
				err = new Error('No data');
				err.statusCode = 204;
				return callback(err);
			}
            zlib.gzip(result.rows[0].mvt, function(err, result) {
                if (!err) {
                    callback(null, result, {'Content-Type': 'application/x-protobuf', 'Content-Encoding': 'gzip'});
                }
            });
		});
	}

	return {
		name: 'postgismvt',
    init: initialize,
		serve: serveMVT
	};
};
