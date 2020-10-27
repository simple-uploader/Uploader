var Uploader = require('../../../src/uploader')

describe('upload file', function () {
  var uploader
  var xhr
  var requests = []

  beforeEach(function () {
    jasmine.clock().install()

    uploader = new Uploader({
      progressCallbacksInterval: 0,
      generateUniqueIdentifier: function (file) {
        return file.size + '__' + file.name
      }
    })

    requests = []
    xhr = sinon.useFakeXMLHttpRequest()
    xhr.onCreate = function (xhr) {
      requests.push(xhr)
    }
  })

  afterEach(function () {
    jasmine.clock().uninstall()

    xhr.restore()
  })

  it('should pass query params', function () {
    uploader.opts.query = {}
    uploader.opts.target = 'file'
    uploader.addFile(new File(['123'], 'file'))
    uploader.upload()
    expect(requests.length).toBe(1)
    expect(requests[0].url).toContain('file')

    uploader.opts.query = {a: 1}
    uploader.files[0].retry()
    expect(requests.length).toBe(2)
    expect(requests[1].url).toContain('file')
    expect(requests[1].url).toContain('a=1')

    uploader.opts.query = function (file, chunk) {
      expect(file).toBe(uploader.files[0])
      expect(chunk).toBe(uploader.files[0].chunks[0])
      return {
        b: 2
      }
    }
    uploader.files[0].retry()
    expect(requests.length).toBe(3)
    expect(requests[2].url).toContain('file')
    expect(requests[2].url).toContain('b=2')
    expect(requests[2].url).not.toContain('a=1')

    uploader.opts.target = 'file?w=w'
    uploader.opts.query = {}
    uploader.files[0].retry()
    expect(requests.length).toBe(4)
    expect(requests[3].url).toContain('file?w=w&')
    expect(requests[3].url).not.toContain('a=1')
    expect(requests[3].url).not.toContain('b=2')
  })

  it('should track file upload status with lots of chunks', function () {
    uploader.opts.chunkSize = 1
    uploader.addFile(new File(['IIIIIIIIII'], 'file2'))
    var file = uploader.files[0]
    expect(file.chunks.length).toBe(10)
    uploader.upload()
    expect(file.progress()).toBe(0)
    for (var i = 0; i < 9; i++) {
      expect(requests[i]).toBeDefined()
      expect(file.isComplete()).toBeFalsy()
      expect(file.isUploading()).toBeTruthy()
      requests[i].respond(200)
      expect(file.progress()).toBe((i+1) / 10)
      expect(file.isComplete()).toBeFalsy()
      expect(file.isUploading()).toBeTruthy()
    }
    expect(requests[9]).toBeDefined()
    expect(file.isComplete()).toBeFalsy()
    expect(file.isUploading()).toBeTruthy()
    expect(file.progress()).toBe(0.9)
    requests[i].respond(200)
    expect(file.isComplete()).toBeTruthy()
    expect(file.isUploading()).toBeFalsy()
    expect(file.progress()).toBe(1)
    expect(uploader.progress()).toBe(1)
  })

  it('should throw expected events', function () {
    var events = []
    uploader.on('catchAll', function (event) {
      events.push(event)
    })
    uploader.opts.chunkSize = 1
    uploader.opts.progressCallbacksInterval = 0
    uploader.addFile(new File(['12'], 'file3'))
    var file = uploader.files[0]
    expect(file.chunks.length).toBe(2)
    uploader.upload()
    // Sync events
    expect(events.length).toBe(4)
    expect(events[0]).toBe('fileAdded')
    expect(events[1]).toBe('filesAdded')
    expect(events[2]).toBe('filesSubmitted')
    expect(events[3]).toBe('uploadStart')
    // Async
    requests[0].respond(200)
    expect(events.length).toBe(5)
    expect(events[4]).toBe('fileProgress')
    requests[1].respond(400)
    expect(events.length).toBe(5)
    requests[2].progress(5, 10, true)
    expect(events.length).toBe(6)
    expect(events[5]).toBe('fileProgress')
    requests[2].respond(200)
    expect(events.length).toBe(9)
    expect(events[6]).toBe('fileProgress')
    expect(events[7]).toBe('fileSuccess')
    expect(events[8]).toBe('fileComplete')

    jasmine.clock().tick(1)
    expect(events.length).toBe(10)
    expect(events[9]).toBe('complete')

    uploader.upload()
    expect(events.length).toBe(11)
    expect(events[10]).toBe('uploadStart')

    // complete event is always asynchronous
    jasmine.clock().tick(1)
    expect(events.length).toBe(12)
    expect(events[11]).toBe('complete')
  })

  it('should pause and resume file', function () {
    uploader.opts.chunkSize = 1
    uploader.opts.simultaneousUploads = 2
    uploader.addFile(new File(['1234'], 'file4'))
    uploader.addFile(new File(['56'], 'file5'))
    var files = uploader.files
    expect(files[0].chunks.length).toBe(4)
    expect(files[1].chunks.length).toBe(2)
    uploader.upload()
    expect(files[0].isUploading()).toBeTruthy()
    expect(requests.length).toBe(2)
    expect(requests[0].aborted).toBeUndefined()
    expect(requests[1].aborted).toBeUndefined()
    // should start upload second file
    files[0].pause()
    expect(files[0].isUploading()).toBeFalsy()
    expect(files[1].isUploading()).toBeTruthy()
    expect(requests.length).toBe(4)
    expect(requests[0].aborted).toBeTruthy()
    expect(requests[1].aborted).toBeTruthy()
    expect(requests[2].aborted).toBeUndefined()
    expect(requests[3].aborted).toBeUndefined()
    // Should resume file after second file chunks is uploaded
    files[0].resume()
    expect(files[0].isUploading()).toBeFalsy()
    expect(requests.length).toBe(4)
    requests[2].respond(200)// second file chunk
    expect(files[0].isUploading()).toBeTruthy()
    expect(files[1].isUploading()).toBeTruthy()
    expect(requests.length).toBe(5)
    requests[3].respond(200) // second file chunk
    expect(requests.length).toBe(6)
    expect(files[0].isUploading()).toBeTruthy()
    expect(files[1].isUploading()).toBeFalsy()
    expect(files[1].isComplete()).toBeTruthy()
    requests[4].respond(200)
    expect(requests.length).toBe(7)
    requests[5].respond(200)
    expect(requests.length).toBe(8)
    requests[6].respond(200)
    expect(requests.length).toBe(8)
    requests[7].respond(200)
    expect(requests.length).toBe(8)
    // Upload finished
    expect(files[0].isUploading()).toBeFalsy()
    expect(files[0].isComplete()).toBeTruthy()
    expect(files[0].progress()).toBe(1)
    expect(files[1].isUploading()).toBeFalsy()
    expect(files[1].isComplete()).toBeTruthy()
    expect(files[1].progress()).toBe(1)
    expect(uploader.progress()).toBe(1)
  })

  it('should retry file', function () {
    uploader.opts.testChunks = false
    uploader.opts.chunkSize = 1
    uploader.opts.simultaneousUploads = 1
    uploader.opts.maxChunkRetries = 1
    uploader.opts.permanentErrors = [500]
    var error = jasmine.createSpy('error')
    var progress = jasmine.createSpy('progress')
    var success = jasmine.createSpy('success')
    var retry = jasmine.createSpy('retry')
    uploader.on('fileError', error)
    uploader.on('fileProgress', progress)
    uploader.on('fileSuccess', success)
    uploader.on('fileRetry', retry)

    uploader.addFile(new File(['12'], 'testfile'))
    var file = uploader.files[0]
    expect(file.chunks.length).toBe(2)
    var firstChunk = file.chunks[0]
    var secondChunk = file.chunks[1]
    expect(firstChunk.status()).toBe('pending')
    expect(secondChunk.status()).toBe('pending')

    uploader.upload()
    expect(requests.length).toBe(1)
    expect(firstChunk.status()).toBe('uploading')
    expect(secondChunk.status()).toBe('pending')

    expect(error).not.toHaveBeenCalled()
    expect(progress).not.toHaveBeenCalled()
    expect(success).not.toHaveBeenCalled()
    expect(retry).not.toHaveBeenCalled()

    requests[0].respond(400)
    expect(requests.length).toBe(2)
    expect(firstChunk.status()).toBe('uploading')
    expect(secondChunk.status()).toBe('pending')

    expect(error).not.toHaveBeenCalled()
    expect(progress).not.toHaveBeenCalled()
    expect(success).not.toHaveBeenCalled()
    expect(retry).toHaveBeenCalled()

    requests[1].respond(200)
    expect(requests.length).toBe(3)
    expect(firstChunk.status()).toBe('success')
    expect(secondChunk.status()).toBe('uploading')

    expect(error).not.toHaveBeenCalled()
    expect(progress.calls.count()).toBe(1)
    expect(success).not.toHaveBeenCalled()
    expect(retry.calls.count()).toBe(1)

    requests[2].respond(400)
    expect(requests.length).toBe(4)
    expect(firstChunk.status()).toBe('success')
    expect(secondChunk.status()).toBe('uploading')

    expect(error).not.toHaveBeenCalled()
    expect(progress.calls.count()).toBe(1)
    expect(success).not.toHaveBeenCalled()
    expect(retry.calls.count()).toBe(2)

    requests[3].respond(400, {}, 'Err')
    expect(requests.length).toBe(4)
    expect(file.chunks.length).toBe(0)

    expect(error.calls.count()).toBe(1)
    expect(error).toHaveBeenCalledWith(file.getRoot(), file, 'Err', secondChunk)
    expect(progress.calls.count()).toBe(1)
    expect(success).not.toHaveBeenCalled()
    expect(retry.calls.count()).toBe(2)

    expect(file.error).toBeTruthy()
    expect(file.isComplete()).toBeFalsy()
    expect(file.isUploading()).toBeFalsy()
    expect(file.progress()).toBe(1)
  })

  it('should retry file with timeout', function () {
    uploader.opts.testChunks = false
    uploader.opts.maxChunkRetries = 1
    uploader.opts.chunkRetryInterval = 100

    var error = jasmine.createSpy('error')
    var success = jasmine.createSpy('success')
    var retry = jasmine.createSpy('retry')
    uploader.on('fileError', error)
    uploader.on('fileSuccess', success)
    uploader.on('fileRetry', retry)

    uploader.addFile(new File(['12'], 'lalal'))
    var file = uploader.files[0]
    uploader.upload()
    expect(requests.length).toBe(1)

    requests[0].respond(400)
    expect(requests.length).toBe(1)
    expect(error).not.toHaveBeenCalled()
    expect(success).not.toHaveBeenCalled()
    expect(retry).toHaveBeenCalled()
    expect(file.chunks[0].status()).toBe('uploading')

    jasmine.clock().tick(100)
    expect(requests.length).toBe(2)
    requests[1].respond(200)
    expect(error).not.toHaveBeenCalled()
    expect(success).toHaveBeenCalled()
    expect(retry).toHaveBeenCalled()
  })

  it('should fail on permanent error', function () {
    uploader.opts.testChunks = false
    uploader.opts.chunkSize = 1
    uploader.opts.simultaneousUploads = 2
    uploader.opts.maxChunkRetries = 1
    uploader.opts.permanentErrors = [500]

    var error = jasmine.createSpy('error')
    var success = jasmine.createSpy('success')
    var retry = jasmine.createSpy('retry')
    uploader.on('fileError', error)
    uploader.on('fileSuccess', success)
    uploader.on('fileRetry', retry)

    uploader.addFile(new File(['abc'], 'asdfs'))
    var file = uploader.files[0]
    expect(file.chunks.length).toBe(3)
    uploader.upload()
    expect(requests.length).toBe(2)
    requests[0].respond(500)
    expect(requests.length).toBe(2)
    expect(error).toHaveBeenCalled()
    expect(retry).not.toHaveBeenCalled()
    expect(success).not.toHaveBeenCalled()
  })

  it('should fail on permanent test error', function () {
    uploader.opts.testChunks = true
    uploader.opts.chunkSize = 1
    uploader.opts.simultaneousUploads = 2
    uploader.opts.maxChunkRetries = 1
    uploader.opts.permanentErrors = [500]

    var error = jasmine.createSpy('error')
    var success = jasmine.createSpy('success')
    var retry = jasmine.createSpy('retry')
    uploader.on('fileError', error)
    uploader.on('fileSuccess', success)
    uploader.on('fileRetry', retry)

    uploader.addFile(new File(['abc'], 'filedd'))
    uploader.upload()
    expect(requests.length).toBe(2)
    requests[0].respond(500)
    expect(requests.length).toBe(2)
    expect(error).toHaveBeenCalled()
    expect(retry).not.toHaveBeenCalled()
    expect(success).not.toHaveBeenCalled()
  })

  it('should upload empty file', function () {
    var error = jasmine.createSpy('error')
    var success = jasmine.createSpy('success')
    uploader.on('fileError', error)
    uploader.on('fileSuccess', success)

    uploader.addFile(new File([], 'ls'))

    // https://github.com/uploaderjs/uploader.js/issues/55
    if (window.navigator.msPointerEnabled) {
      expect(uploader.files.length, 0)
    } else {
      expect(uploader.files.length, 1)
      var file = uploader.files[0]
      uploader.upload()
      expect(requests.length).toBe(1)
      expect(file.progress()).toBe(0)
      requests[0].respond(200)
      expect(requests.length).toBe(1)
      expect(error).not.toHaveBeenCalled()
      expect(success).toHaveBeenCalled()
      expect(file.progress()).toBe(1)
      expect(file.isUploading()).toBe(false)
      expect(file.isComplete()).toBe(true)
    }
  })

  it('should not upload folder', function () {
    // http://stackoveruploader.com/questions/8856628/detecting-folders-directories-in-javascript-filelist-objects
    uploader.addFile({
      name: '.',
      size: 0
    })
    expect(uploader.files.length).toBe(0)
    uploader.addFile({
      name: '.',
      size: 4096
    })
    expect(uploader.files.length).toBe(0)
    uploader.addFile({
      name: '.',
      size: 4096 * 2
    })
    expect(uploader.files.length).toBe(0)
  })

  it('should preprocess chunks', function () {
    var preprocess = jasmine.createSpy('preprocess')
    var error = jasmine.createSpy('error')
    var success = jasmine.createSpy('success')
    uploader.on('fileError', error)
    uploader.on('fileSuccess', success)
    uploader.opts.preprocess = preprocess
    uploader.addFile(new File(['abc'], 'abc'))
    var file = uploader.files[0]
    uploader.upload()
    expect(requests.length).toBe(0)
    expect(preprocess).toHaveBeenCalledWith(file.chunks[0])
    expect(file.chunks[0].preprocessState).toBe(1)
    file.chunks[0].preprocessFinished()
    expect(requests.length).toBe(1)
    requests[0].respond(200, [], 'response')
    expect(success).toHaveBeenCalledWith(file.getRoot(), file, 'response', file.chunks[0])
    expect(error).not.toHaveBeenCalled()
  })

  it('should preprocess chunks and wait for preprocess to finish', function () {
    uploader.opts.simultaneousUploads = 1
    var preprocess = jasmine.createSpy('preprocess')
    uploader.opts.preprocess = preprocess
    uploader.addFile(new File(['abc'], 'abc'))
    uploader.addFile(new File(['abca'], 'abca'))
    var file = uploader.files[0]
    var secondFile = uploader.files[1]
    uploader.upload()
    expect(requests.length).toBe(0)
    expect(preprocess).toHaveBeenCalledWith(file.chunks[0])
    expect(preprocess).not.toHaveBeenCalledWith(secondFile.chunks[0])

    uploader.upload()
    expect(preprocess).not.toHaveBeenCalledWith(secondFile.chunks[0])
  })

  it('should resume preprocess chunks after pause', function () {
    uploader.opts.chunkSize = 1
    uploader.opts.simultaneousUploads = 1
    uploader.opts.testChunks = false
    var preprocess = jasmine.createSpy('preprocess')
    var error = jasmine.createSpy('error')
    var success = jasmine.createSpy('success')
    uploader.on('fileError', error)
    uploader.on('fileSuccess', success)
    uploader.opts.preprocess = preprocess
    uploader.addFile(new File(['abc'], 'abcfile'))
    var file = uploader.files[0]
    uploader.upload()
    for (var i = 0; i < file.chunks.length; i++) {
      expect(preprocess).toHaveBeenCalledWith(file.chunks[i])
      file.chunks[i].preprocessFinished()
      file.pause()
      file.resume()
      requests[requests.length-1].respond(200, [], 'response')
    }
    expect(success).toHaveBeenCalledWith(file.getRoot(), file, 'response', file.chunks[file.chunks.length-1])
    expect(error).not.toHaveBeenCalled()
  })

  it('should set chunk as a third event parameter', function () {
    var success = jasmine.createSpy('success')
    uploader.on('fileSuccess', success)
    uploader.addFile(new File(['abc'], 'abccc'))
    var file = uploader.files[0]
    uploader.upload()
    requests[0].respond(200, [], 'response')
    expect(success).toHaveBeenCalledWith(file.getRoot(), file, 'response', file.chunks[0])
  })

  it('should have upload speed', function () {
    var clock = sinon.useFakeTimers()
    uploader.opts.testChunks = false
    uploader.opts.speedSmoothingFactor = 0.5
    uploader.opts.simultaneousUploads = 1
    var fileProgress = jasmine.createSpy('fileProgress')
    uploader.on('fileProgress', fileProgress)
    uploader.addFile(new File(['0123456789'], 'adsfsdfs'))
    uploader.addFile(new File(['12345'], 'asdfdf'))
    var fileFirst = uploader.files[0]
    var fileSecond = uploader.files[1]
    expect(fileFirst.currentSpeed).toBe(0)
    expect(fileFirst.averageSpeed).toBe(0)
    expect(fileFirst.sizeUploaded()).toBe(0)
    expect(fileFirst.timeRemaining()).toBe(Number.POSITIVE_INFINITY)
    expect(uploader.sizeUploaded()).toBe(0)
    expect(uploader.timeRemaining()).toBe(Number.POSITIVE_INFINITY)
    uploader.upload()

    clock.tick(1000)
    requests[0].progress(50, 100, true)
    expect(fileProgress).toHaveBeenCalled()
    expect(fileFirst.currentSpeed).toBe(5)
    expect(fileFirst.averageSpeed).toBe(2.5)
    expect(fileFirst.sizeUploaded()).toBe(5)
    expect(fileFirst.timeRemaining()).toBe(2)

    expect(uploader.sizeUploaded()).toBe(5)
    expect(uploader.timeRemaining()).toBe(4)

    clock.tick(1000)
    requests[0].progress(10, 10, true)
    expect(fileFirst.currentSpeed).toBe(5)
    expect(fileFirst.averageSpeed).toBe(3.75)

    requests[0].respond(200, [], 'response')
    expect(fileFirst.currentSpeed).toBe(0)
    expect(fileFirst.averageSpeed).toBe(0)

    requests[1].respond(200, [], 'response')
    expect(fileFirst.sizeUploaded()).toBe(10)
    expect(fileFirst.timeRemaining()).toBe(0)
    expect(fileSecond.sizeUploaded()).toBe(5)
    expect(fileSecond.timeRemaining()).toBe(0)
    expect(uploader.sizeUploaded()).toBe(15)
    expect(uploader.timeRemaining()).toBe(0)

    // paused and resumed
    uploader.addFile(new File(['012345678901234'], 'sdfasdf'))
    var fileThird = uploader.files[2]
    expect(fileThird.timeRemaining()).toBe(Number.POSITIVE_INFINITY)
    uploader.upload()
    clock.tick(1000)
    requests[2].progress(10, 15, true)
    expect(fileThird.timeRemaining()).toBe(1)
    expect(uploader.timeRemaining()).toBe(1)
    fileThird.pause()
    expect(fileThird.timeRemaining()).toBe(0)
    expect(uploader.timeRemaining()).toBe(0)
    fileThird.resume()
    expect(fileThird.timeRemaining()).toBe(Number.POSITIVE_INFINITY)
    expect(uploader.timeRemaining()).toBe(Number.POSITIVE_INFINITY)
    clock.tick(1000)
    requests[3].progress(11, 15, true)
    expect(fileThird.timeRemaining()).toBe(8)
    expect(uploader.timeRemaining()).toBe(8)
    clock.tick(1000)
    requests[3].progress(12, 15, true)
    expect(fileThird.timeRemaining()).toBe(4)
    expect(uploader.timeRemaining()).toBe(4)

    requests[3].respond(500)
    expect(fileThird.currentSpeed).toBe(0)
    expect(fileThird.averageSpeed).toBe(0)
    expect(fileThird.timeRemaining()).toBe(0)
    expect(uploader.timeRemaining()).toBe(0)
  })

  it('should allow to hook initFileFn and readFileFn', function () {
    var error = jasmine.createSpy('error')
    var success = jasmine.createSpy('success')
    uploader.on('fileError', error)
    uploader.on('fileSuccess', success)

    uploader.opts.chunkSize = 1

    uploader.opts.simultaneousUploads = 10

    uploader.opts.initFileFn = function(uploaderObj) {
      // emulate a compressor that starting from a payload of 10 characters
      // will output 6 characters.
      var fakeFile = {
        size: 6
      }

      uploaderObj.file = fakeFile
      uploaderObj.size = uploaderObj.file.size
    }

    uploader.opts.readFileFn = function(fileObj, startByte, endByte, fileType, chunk) {
      chunk.readFinished('X')
    }

    uploader.addFile(new File(['0123456789'], 'ldlldl'))

    uploader.upload()

    expect(requests.length).toBe(6)

    for (var i = 0; i < requests.length; i++) {
      requests[i].respond(200)
    }

    var file = uploader.files[0]
    expect(file.progress()).toBe(1)
    expect(file.isUploading()).toBe(false)
    expect(file.isComplete()).toBe(true)

    expect(requests.length).toBe(6)
  })

  it('should skip upload chunks by response - checkChunkUploadedByResponse', function () {
    uploader.opts.testChunks = true
    uploader.opts.chunkSize = 1
    uploader.opts.simultaneousUploads = 3
    uploader.opts.checkChunkUploadedByResponse = function(chunk, message) {
      var objMessage = {}
      try {
        objMessage = JSON.parse(message)
      } catch (e) {}
      return objMessage.uploaded_chunks.indexOf(chunk.offset + 1) >= 0
    }

    uploader.addFile(new File(['0123456789'], 'ldlldl'))

    uploader.upload()

    expect(requests.length).toBe(1)
    expect(requests[0].method).toBe('GET')
    requests[0].respond(200, [], '{"uploaded_chunks": [2, 3, 4, 5, 9]}')

    expect(requests.length).toBe(1 + 3)
    expect(requests[1].method).toBe('POST')
    expect(requests[3].method).toBe('POST')
    for (var i = 1; i < requests.length; i++) {
      requests[i].respond(200)
    }
    expect(requests.length).toBe(6)
    requests[4].respond(200)
    requests[5].respond(200)
    var file = uploader.files[0]
    expect(file.progress()).toBe(1)
    expect(file.isUploading()).toBe(false)
    expect(file.isComplete()).toBe(true)
  })

  it('should resume one file when initialPaused is true', function () {
    uploader.opts.initialPaused = true
    uploader.addFile(new File(['IIIIIIIIII'], 'file2'))
    uploader.addFile(new File(['IIIIIIIIII'], 'file3'))

    uploader.upload()

    expect(uploader.isUploading()).toBe(false)
    expect(uploader.files[0].paused).toBe(true)
    expect(uploader.files[1].paused).toBe(true)
    uploader.files[0].resume()
    expect(uploader.isUploading()).toBe(true)
    expect(uploader.files[0].paused).toBe(false)
    expect(uploader.files[1].paused).toBe(true)
  })
})
