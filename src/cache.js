/**
 * cache model
 */

/**
 * User class
 */

import Sequelize from 'sequelize'

import sequelize from './sequelize'

export const User = sequelize.define('cache', {
  id: {
    type: Sequelize.STRING,
    primaryKey: true
  },
  result: {
    type: Sequelize.JSON
  }
})
