# tilestrata-postgismvt
[![NPM version](http://img.shields.io/npm/v/tilestrata-postgismvt.svg?style=flat)](https://www.npmjs.org/package/tilestrata-postgismvt)

A [TileStrata](https://github.com/naturalatlas/tilestrata) plugin for retrieving [Mapbox Vector Tiles](https://github.com/mapbox/vector-tile-spec) from a PostGIS database.

```sh
$ npm install tilestrata-postgismvt --save
```

### Sample Usage

Serve all map features.

![default](img/default.png?raw=true "default")

```js
var postgismvt = require('tilestrata-postgismvt');

server.layer('mylayer').route('tile.mvt')
  .use(postgismvt({
    lyr: {
      table: 'schema.table',
      geometry: 'geom',
      type: 'circle',
      srid: 4326,
      minZoom: 3,
      maxZoom: 19,
      buffer: 10
      fields: 'name gid',
      resolution: 256,
    },
    pgConfig: {
      host: 'localhost',
      user: 'postgres',
      password: 'mypassword',
      database: 'postgres',
      port: '5432'
    }}))
  );
```

### Point clustering

Clustering can be used for point features sharing a coordinate in the tile coordinate space. Each feature contains an attribute *count* that can be used e. g. for a density map.

*cluster*: Attributes will be dropped.

![cluster](img/cluster.png?raw=true "cluster")

```js
server.layer('mylayer').route('tile.mvt')
  .use(postgismvt({
    lyr: {
      ...
      mode: 'cluster'
    },
    pgConfig: {
      ...
    }}))
  );
```

*cluster_fields*: Attributes will be concatenated.

![cluster_fields](img/cluster_fields.png?raw=true "cluster_fields")

```js
server.layer('mylayer').route('tile.mvt')
  .use(postgismvt({
    lyr: {
      ...
      mode: 'cluster_fields'
    },
    pgConfig: {
      ...
    }}))
  );
```

*resolution* and *mode* both support a function as a parameter. The following configuration serves attributes in higher zoom levels only and increases the spatial accuracy.

```js
server.layer('mylayer').route('tile.mvt')
  .use(postgismvt({
    lyr: {
      resolution: function(server, req) {
        if (req.z > 12) return 512;
        return 256;
      },
      mode: function(server, req) {
        if (req.z > 15) return null;
        if (req.z > 13) return 'cluster_fields';
        return 'cluster';
      }
    },
    pgConfig: {
      ...
    }}))
  );
```

## Requirements

- PostGIS 2.4.0
- [TileBBox.sql](https://github.com/mapbox/postgis-vt-util/blob/master/src/TileBBox.sql)

## License

Copyright &copy; 2017 [Stefan Zimmer](https://github.com/Stezii)

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at: http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
