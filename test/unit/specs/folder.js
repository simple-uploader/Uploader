var Uploader = require('../../../src/uploader')

describe('Uploader.File functions - folder', function () {
	var uploader
	var file

	beforeEach(function () {
		uploader = new Uploader({})
		var rFile = new File(['xx'], 'image.jpg', {
			type: 'image/png'
		})
		rFile.relativePath = 'a/b/image.jpg'
		file = new Uploader.File(uploader, rFile, uploader)
		uploader.files.push(file)
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

	it('getSize', function () {
		expect(file.getSize()).toBe(2)
	})

	it('getFormatSize', function () {
		expect(file.getFormatSize()).toBe('2 bytes')
	})

	it('isError', function () {
		expect(file.isError()).toBe(false)
		file.error = true
		expect(file.isError()).toBe(true)
	})

	it('getRoot', function () {
		var root = file.getRoot()
		expect(root.files[0]).toBe(file)
		expect(root.fileList[0].fileList[0]).toBe(file)
		expect(root.getSize()).toBe(2)
		expect(root.getFormatSize()).toBe('2 bytes')
		expect(root.getExtension()).toBe('')
		expect(root.getType()).toBe('folder')
		expect(root.isError()).toBe(false)
		file.error = true
		expect(root.isError()).toBe(true)
		file.error = false
		expect(root.isComplete()).toBe(false)
		expect(root.isUploading()).toBe(false)
		expect(uploader.getRoot()).toBe(uploader)
		uploader.removeFile(root)
		expect(root.parent).toBe(null)
		expect(file.parent).toBe(null)
		expect(uploader.files.length).toBe(0)
		expect(uploader.fileList.length).toBe(0)
	})
})
