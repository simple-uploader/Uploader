var _ = require('../../../src/utils')

describe('utils', function () {
  
  it('noop', function () {
    expect(_.noop).toBeDefined()
    expect(_.noop()).toBeUndefined()
  })

  it('bind', function () {
    var fn = _.bind(function () {
      return this.a
    }, {a: 'a'})
    expect(fn()).toBe('a')
  })

  it('preventEvent', function () {
    var v = 1
    _.preventEvent({
      preventDefault: function () {
        v = 2
      }
    })
    expect(v).toBe(2)
  })

  it('stop', function () {
    var v = 1
    var v2 = 1
    _.stop({
      preventDefault: function () {
        v = 2
      },
      stopPropagation: function () {
        v2 = 2
      }
    })
    expect(v).toBe(2)
    expect(v2).toBe(2)
  })

  it('nextTick', function (done) {
    var ct = {
      a: 'a'
    }
    _.nextTick(function () {
      this.a = 'b'
    }, ct)
    expect(ct.a).toBe('a')
    setTimeout(function () {
      expect(ct.a).toBe('b')
      done()
    }, 10)
  })

  it('toArray', function () {
    var r = _.toArray({
      0: 0,
      1: 1,
      length: 2
    }, 0, 1)
    expect(r.length).toBe(1)
    r.push(2)
    expect(r.length).toBe(2)
    expect(r[1]).toBe(2)
  })

  it('isPlainObject', function () {
    expect(_.isPlainObject({})).toBe(true)
    expect(_.isPlainObject([])).toBe(false)
    expect(_.isPlainObject(null)).toBe(false)
    expect(_.isPlainObject(null)).toBeFalsy()
    expect(_.isPlainObject(123)).toBeFalsy()
    expect(_.isPlainObject(true)).toBeFalsy()
    expect(_.isPlainObject('uploader')).toBeFalsy()
    expect(_.isPlainObject(undefined)).toBeFalsy()
    expect(_.isPlainObject(function () {})).toBe(false)
    if (typeof window !== 'undefined') {
      expect(_.isPlainObject(window)).toBe(false)
    }
  })

  it('isFunction', function () {
    expect(_.isFunction({})).toBe(false)
    expect(_.isFunction([])).toBe(false)
    expect(_.isFunction(null)).toBe(false)
    expect(_.isFunction(null)).toBeFalsy()
    expect(_.isFunction(123)).toBeFalsy()
    expect(_.isFunction(true)).toBeFalsy()
    expect(_.isFunction('uploader')).toBeFalsy()
    expect(_.isFunction(undefined)).toBeFalsy()
    expect(_.isFunction(function () {})).toBe(true)
  })

  it('isArray', function () {
    expect(_.isArray({})).toBe(false)
    expect(_.isArray([])).toBe(true)
    expect(_.isArray(null)).toBe(false)
    expect(_.isArray(null)).toBeFalsy()
    expect(_.isArray(123)).toBeFalsy()
    expect(_.isArray(true)).toBeFalsy()
    expect(_.isArray('uploader')).toBeFalsy()
    expect(_.isArray(undefined)).toBeFalsy()
    expect(_.isArray(function () {})).toBe(false)
  })

  it('isObject', function () {
    expect(_.isObject({})).toBe(true)
    expect(_.isObject([])).toBe(true)
    expect(_.isObject(null)).toBeFalsy()
    expect(_.isObject(123)).toBeFalsy()
    expect(_.isObject(true)).toBeFalsy()
    expect(_.isObject('uploader')).toBeFalsy()
    expect(_.isObject(undefined)).toBeFalsy()
    expect(_.isObject(function () {})).toBe(true)
  })

  it('isString', function () {
    expect(_.isString({})).toBe(false)
    expect(_.isString([])).toBe(false)
    expect(_.isString(null)).toBeFalsy()
    expect(_.isString(123)).toBeFalsy()
    expect(_.isString(true)).toBeFalsy()
    expect(_.isString('uploader')).toBe(true)
    expect(_.isString(undefined)).toBeFalsy()
    expect(_.isString(function () {})).toBe(false)
  })

  it('isUndefined', function () {
    expect(_.isUndefined({})).toBe(false)
    expect(_.isUndefined([])).toBe(false)
    expect(_.isUndefined(null)).toBeFalsy()
    expect(_.isUndefined(123)).toBeFalsy()
    expect(_.isUndefined(true)).toBeFalsy()
    expect(_.isUndefined('uploader')).toBeFalsy()
    expect(_.isUndefined(undefined)).toBe(true)
    expect(_.isUndefined(function () {})).toBe(false)
  })

  it('isDefined', function () {
    expect(_.isDefined({})).toBe(true)
    expect(_.isDefined([])).toBe(true)
    expect(_.isDefined(null)).toBe(true)
    expect(_.isDefined(123)).toBe(true)
    expect(_.isDefined(true)).toBe(true)
    expect(_.isDefined('uploader')).toBe(true)
    expect(_.isDefined(undefined)).toBeFalsy()
    expect(_.isDefined(function () {})).toBe(true)
  })

  it('each', function () {
    var a = [1, 2]
    var r = 0
    _.each(a, function (v) {
      r++
      return false
    })
    expect(r).toBe(1)
    r = 0
    _.each(a, function (v) {
      r++
    })
    expect(r).toBe(2)
    a = {a: 1, b: 2}
    r = 0
    _.each(a, function (v) {
      r++
      return false
    })
    expect(r).toBe(1)
    r = 0
    _.each(a, function (v) {
      r++
    })
    expect(r).toBe(2)
  })

  it('evalOpts', function () {
    var o = {}
    expect(_.evalOpts(o)).toBe(o)
    expect(_.evalOpts(5)).toBe(5)
    expect(_.evalOpts(function () {
      return 5
    })).toBe(5)
    expect(_.evalOpts(function (a) {
      return a
    }, o)).toBe(o)
  })

  it('extend', function () {
    var from = {a: 1, b: 2}
    var to = {}
    var res = _.extend(to, from)
    expect(to.a).toBe(from.a)
    expect(to.b).toBe(from.b)
    expect(res).toBe(to)

    from = {
      a: 1,
      b: {
        c: 2
      }
    }
    to = {}
    res = _.extend(true, to, from)
    expect(to.a).toBe(from.a)
    expect(to.b).not.toBe(from.b)
    expect(to.b.c).toBe(from.b.c)
    expect(res).toBe(to)

    // some check cases
    _.extend('str', from)
    _.extend('', from)
    _.extend(true)
    _.extend({
      x: 'x'
    })
    expect(_.x).toBe('x')
  })

  it('formatSize', function () {
    expect(_.formatSize(0)).toBe('0 bytes')
    expect(_.formatSize(2.2 * 1024)).toBe('2 KB')
    expect(_.formatSize(2.14 * 1024 * 1024)).toBe('2.1 MB')
    expect(_.formatSize(5.14 * 1024 * 1024 * 1024)).toBe('5.1 GB')
  })
})
