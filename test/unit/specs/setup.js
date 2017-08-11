var Uploader = require('../../../src/uploader')

describe('setup', function () {
  var uploader

  beforeEach(function () {
    uploader = new Uploader({
      generateUniqueIdentifier: function (file) {
        return file.size
      }
    })
  })

  it('should be supported', function () {
    expect(uploader.support).toBeTruthy()
  })

  it('files should be empty', function () {
    expect(uploader.files).toBeDefined()
    expect(uploader.files.length).toBe(0)
  })

  it('set opts', function () {
    uploader = new Uploader({
      chunkSize: 123
    })
    expect(uploader.opts.chunkSize).toBe(123)
    expect(uploader.opts.simultaneousUploads).toBe(Uploader.defaults.simultaneousUploads)
  })

  it('should show methods initial state', function () {
    expect(uploader.uploadNextChunk()).toBe(false)

    expect(uploader.progress()).toBe(0)
    expect(uploader.isUploading()).toBe(false)
    expect(uploader.timeRemaining()).toBe(0)
    expect(uploader.sizeUploaded()).toBe(0)
  })

  it('should return total files size', function () {
    expect(uploader.getSize()).toBe(0)
    uploader.addFile(new File(['1234'], 'test'))
    expect(uploader.getSize()).toBe(4)
    uploader.addFile(new File(['123'], 'test2'))
    expect(uploader.getSize()).toBe(7)
  })

  it('should find file by identifier', function () {
    expect(uploader.getFromUniqueIdentifier('')).toBe(false)
    uploader.addFile(new File(['1234'], 'test'))
    expect(uploader.getFromUniqueIdentifier(4)).toBe(uploader.files[0])
  })

  describe('assignBrowse', function () {
    it('assign to input', function () {
      var input = document.createElement('input')
      var addFiles = jasmine.createSpy('addFiles')
      uploader.addFiles = addFiles
      input.type = 'file'
      uploader.assignBrowse(input)
      expect(input.hasAttribute('multiple')).toBeTruthy()
      expect(addFiles).not.toHaveBeenCalled()
      var event = document.createEvent('MouseEvents')
      event.initEvent('change', true, true)
      input.dispatchEvent(event)
      expect(addFiles).not.toHaveBeenCalled()
    })

    it('assign to div', function () {
      var div = document.createElement('div')
      var addFiles = jasmine.createSpy('addFiles')
      uploader.addFiles = addFiles
      uploader.assignBrowse(div)
      expect(div.children.length).toBe(1)
      var input = div.children[0]
      expect(addFiles).not.toHaveBeenCalled()
      var event = document.createEvent('MouseEvents')
      event.initEvent('change', true, true)
      input.dispatchEvent(event)
      expect(addFiles).not.toHaveBeenCalled()
    })

    it('single file', function () {
      var input = document.createElement('input')
      input.type = 'file'
      uploader.assignBrowse(input, false, true)
      expect(input.hasAttribute('multiple')).toBeFalsy()
    })

    it('directory', function () {
      var input = document.createElement('input')
      input.type = 'file'
      uploader.assignBrowse(input, true)
      expect(input.hasAttribute('webkitdirectory')).toBeTruthy()
    })
  })

  describe('assignDrop', function () {
    it('assign to div', function () {
      var div = document.createElement('div')
      var onDrop = jasmine.createSpy('onDrop')
      uploader.onDrop = onDrop
      uploader.assignDrop(div)
      var event = document.createEvent('MouseEvents')
      event.initEvent('drop', true, true)
      event.dataTransfer = {files: []}
      div.dispatchEvent(event)
      expect(onDrop).toHaveBeenCalled()
      expect(onDrop.calls.count()).toBe(1)

      uploader.unAssignDrop(div)
      div.dispatchEvent(event)
      expect(onDrop.calls.count()).toBe(1)
    })
  })
})
