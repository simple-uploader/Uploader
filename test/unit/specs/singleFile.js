var Uploader = require('../../../src/uploader')

describe('add single file', function () {
  var uploader

  beforeEach(function () {
    uploader = new Uploader({
      generateUniqueIdentifier: function (file) {
        return file.size
      },
      singleFile: true
    })
  })

  it('should add single file', function () {
    uploader.addFile(new File(['file part'], 'file'))
    expect(uploader.files.length).toBe(1)
    var file = uploader.files[0]
    uploader.upload()
    expect(file.isUploading()).toBeTruthy()
    uploader.addFile(new File(['file part 2'], 'file2'))
    expect(uploader.files.length).toBe(1)
    expect(file.isUploading()).toBeFalsy()
  })
  
  it('should fire remove event after adding another file', function () {
    var events = []
    uploader.on('catchAll', function (event) {
      events.push(event)
    })
    uploader.addFile(new File(['file part'], 'file'))
    expect(uploader.files.length).toBe(1)
    expect(events.length).toBe(3)
    expect(events[0]).toBe('fileAdded')
    expect(events[1]).toBe('filesAdded')
    expect(events[2]).toBe('filesSubmitted')
    
    var removedFile = uploader.files[0]
    uploader.on('fileRemoved', function(file){
      expect(file).toBe(removedFile) 
    })
    uploader.addFile(new File(['file part 2'], 'file2'))
    expect(uploader.files.length).toBe(1)
    expect(events.length).toBe(7)
    expect(events[3]).toBe('fileAdded')
    expect(events[4]).toBe('filesAdded')
    expect(events[5]).toBe('fileRemoved')
    expect(events[6]).toBe('filesSubmitted')
  })
})
