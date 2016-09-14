import path = require('path');
import dotty = require('dotty');

import Property, { PropertyDefinition } from './property';
import Type, { TypeDefinition } from './type';

import numberType from './types/number';
import booleanType from './types/boolean';
import stringType from './types/string';
import arrayType from './types/array';
import objectType from './types/object';

export interface HydrateOptionsDefinition {
  transform?: boolean;
  cast?: boolean;
  validate?: boolean;
}

export interface SchemaDefinition {
  [optName: string]: any;
}

export interface ParsedSchemaDefinition {
  [optName: string]: Property;
}

interface HydratedConfig {
  [optName: string]: any;
}

function getter(
  config: HydratedConfig,
  property: Property,
  path: string,
  rawValue: any,
  flags: HydrateOptionsDefinition
): any {
  let value: any;

  switch (typeof rawValue) {
    case 'function':
      value = rawValue(config, path);
      break;
    case 'string':
      value = rawValue.replace(/(\$\{(.*)\})/gi, (
        match: string,
        group1: string,
        key: string
      ) => dotty.get(config, key));
      break;
    default:
      value = rawValue;
  }

  if (flags.transform) value = property.transform(value, config);
  if (flags.cast) value = property.cast(value);
  if (flags.validate) property.validate(value);

  return value;
};

export default class Schema {
  definition: ParsedSchemaDefinition;

  static parse(
    rawDefinition: SchemaDefinition,
    startingPath?: String
  ): ParsedSchemaDefinition {
    // 1. Loop through keys on object
    // 2. Determine if value assigned to key is a Property or a nested object
    // 3. Convert properties to Property objects
    // 4. Parse nested values recursively

    const parsedObj: ParsedSchemaDefinition = {};

    Object.keys(rawDefinition).forEach((key) => {
      const definition = rawDefinition[key];
      const fullPath = startingPath ? [startingPath, key].join('.') : key;

      if (Property.isProperty(definition)) {
        parsedObj[fullPath] = new Property(fullPath, definition);
      } else if (Property.isNested(definition)) {
        Object.assign(parsedObj, Schema.parse(definition, fullPath));
      } else {
        throw new Error(`Property definition for ${fullPath} is illegal`);
      }
    });

    return parsedObj;
  }

  static addType(name: string, definition: TypeDefinition): void {
    Type.set(name, definition);
  }

  constructor(rawDefinition: SchemaDefinition) {
    this.definition = Schema.parse(rawDefinition);
  }

  hydrate(rawConfig: Object, options: HydrateOptionsDefinition = {}): Object {
    const flags = {
      transform: !Reflect.has(options, 'transform') || options.transform,
      cast: !Reflect.has(options, 'cast') || options.cast,
      validate: !Reflect.has(options, 'validate') || options.validate,
    }

    // Find all the schema paths we need to trace
    const paths = Object.keys(this.definition);

    // Loop over and hydrate the object with getters
    const hydratedConfig: HydratedConfig = paths.reduce((config, path) => {
      const property = this.definition[path];

      const curriedGetter = getter.bind(
        this,
        config,
        property,
        path,
        property.resolve(rawConfig),
        flags
      );

      Object.defineProperty(config, path, {get:  curriedGetter });
      return config;
    }, {});

    // Evaluate each of the paths provided in the schema
    return paths.reduce((config, key) => {
      dotty.put(config, key, hydratedConfig[key]);
      return config;
    }, {});
  }
}

Schema.addType('number', numberType);
Schema.addType('string', stringType);
Schema.addType('boolean', booleanType);
Schema.addType('array', arrayType);
Schema.addType('object', objectType);