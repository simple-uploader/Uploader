var Uploader = require('../../../src/uploader')

describe('Uploader.File functions - file', function () {
  var uploader
  var file

  beforeEach(function () {
    uploader = new Uploader({})
    var rFile = new File(['xx'], 'image.jpg', {
      type: 'image/png'
    })
    file = new Uploader.File(uploader, rFile, uploader)
  })

  it('should get type', function () {
    expect(file.getType()).toBe('png')
    file.file.type = ''
    expect(file.getType()).toBe('')
  })

  it('should get extension', function () {
    expect(file.name).toBe('image.jpg')
    expect(file.getExtension()).toBe('jpg')
    file.name = ''
    expect(file.getExtension()).toBe('')
    file.name = 'image'
    expect(file.getExtension()).toBe('')
    file.name = '.dwq.dq.wd.qdw.E'
    expect(file.getExtension()).toBe('e')
  })

  it('error', function () {
    expect(file.error).toBe(false)
  })

  it('getSize', function () {
    expect(file.getSize()).toBe(2)
  })

  it('getFormatSize', function () {
    expect(file.getFormatSize()).toBe('2 bytes')
  })

  it('isComplete', function () {
    expect(file.isComplete()).toBe(false)
  })

  it('getRoot', function () {
    var rootFile = file.getRoot()
    expect(rootFile).toBe(file)
  })
})
