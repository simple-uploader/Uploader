var _ = require('../../../src/utils')
var uevent = require('../../../src/event')

describe('event', function () {

  beforeEach(function () {
    this.eventBus = _.extend({}, uevent)
  })

  it('_eventData', function () {
    expect(_.isPlainObject(this.eventBus)).toBe(true)
    expect(this.eventBus._eventData).toBe(null)
    var f = function () {}
    this.eventBus.on('uploaderEvent', f)
    this.eventBus.on('uploaderEvent', f)
    expect(this.eventBus._eventData).not.toBe(null)
    expect(_.isArray(this.eventBus._eventData.uploaderEvent)).toBe(true)
    expect(this.eventBus._eventData.uploaderEvent.length).toBe(1)
  })

  it('on & trigger', function () {
    var a = 0
    var a2 = 0
    var f = function () {
      a = 1
    }
    var f2 = function (b) {
      a2 = b
    }
    this.eventBus.on('uploaderEvent', f)
    expect(a).toBe(0)
    this.eventBus.trigger('uploaderEvent')
    expect(a).toBe(1)
    this.eventBus.on('uploaderEvent', f2)
    expect(a2).toBe(0)
    this.eventBus.trigger('uploaderEvent', 3)
    expect(a).toBe(1)
    expect(a2).toBe(3)
  })

  it('off & trigger', function () {
    var a = 0
    var a2 = 0
    var f = function (b) {
      a = b
    }
    var f2 = function (b) {
      a2 = b
    }
    this.eventBus.on('uploaderEvent', f)
    expect(a).toBe(0)
    this.eventBus.trigger('uploaderEvent', 1)
    expect(a).toBe(1)
    this.eventBus.on('uploaderEvent', f2)
    expect(a2).toBe(0)
    this.eventBus.trigger('uploaderEvent', 3)
    expect(a).toBe(3)
    expect(a2).toBe(3)
    this.eventBus.off('uploaderEvent', f2)
    this.eventBus.trigger('uploaderEvent', 4)
    expect(a).toBe(4)
    expect(a2).toBe(3)
    this.eventBus.off('uploaderEvent')
    this.eventBus.trigger('uploaderEvent', 5)
    expect(a).toBe(4)
    expect(a2).toBe(3)
  })

})
