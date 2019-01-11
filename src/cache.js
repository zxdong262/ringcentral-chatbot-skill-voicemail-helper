/**
 * cache model
 */

import Sequelize from 'sequelize'

export const User = Sequelize.define('cache', {
  id: {
    type: Sequelize.STRING,
    primaryKey: true
  },
  result: {
    type: Sequelize.JSON
  }
})
