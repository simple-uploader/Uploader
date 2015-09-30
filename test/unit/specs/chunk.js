var Uploader = require('../../../src/uploader')

describe('chunk', function () {

	var uploader = new Uploader()
	var xhr
	var requests = []
	beforeEach(function () {
		uploader = new Uploader({
			progressCallbacksInterval: 0,
			generateUniqueIdentifier: function (f) {
				return f.size
			}
		})

		requests = []

		xhr = sinon.useFakeXMLHttpRequest()
		xhr.onCreate = function (_xhr) {
			requests.push(_xhr)
		}
	})
	afterEach(function () {
		xhr.restore()
	})

	it('init', function () {
		var file = {
			name: 'image.jpg',
			type: 'image/png',
			size: 10
		}
		var ufile = new Uploader.Ufile(uploader, file, uploader)
		expect(requests.length).toBe(0)

		expect(ufile.chunks.length).toBe(1)
		var uchunk = ufile.chunks[0]
		expect(uchunk.offset).toBe(0)
		expect(uchunk.chunkSize).toBe(1024 * 1024)
		expect(uchunk.endByte).toBe(10)
		expect(uchunk.status()).toBe(Uploader.Uchunk.STATUS.PENDING)
		expect(uchunk.progress()).toBe(0)
		expect(uchunk.sizeUploaded()).toBe(0)
		expect(uchunk.message()).toBe('')
		var params = uchunk.getParams()
		expect(params.uFilename).toBe(file.name)
		expect(params.uRelativePath).toBe(file.name)
		expect(params.uTotalChunks).toBe(1)
	})

	it('upload success', function () {
		uploader.opts.query = {}
		uploader.opts.target = 'file'
		uploader.addFile(new File(['123'], 'file.ddd'))
		uploader.upload()
		expect(requests.length).toBe(1)
		expect(requests[0].url).toContain('file')
		var ufile = uploader.files[0]
		expect(ufile.chunks.length).toBe(1)
		var uchunk = ufile.chunks[0]
		expect(uchunk.status()).toBe(Uploader.Uchunk.STATUS.UPLOADING)
		expect(ufile.progress()).toBe(0)
		expect(ufile.isComplete()).toBeFalsy()
		expect(ufile.isUploading()).toBeTruthy()
		requests[0].respond(200)
		expect(ufile.isComplete()).toBeTruthy()
		expect(ufile.isUploading()).toBeFalsy()
		expect(uchunk.progress()).toBe(1)
		expect(uchunk.sizeUploaded()).toBe(3)
		expect(uchunk.status()).toBe(Uploader.Uchunk.STATUS.SUCCESS)
	})

	it('upload via multiple chunks', function () {
		uploader.opts.query = {}
		uploader.opts.target = 'file'
		uploader.opts.chunkSize = 1
		uploader.addFile(new File(['1111111111'], 'file.ddd'))
		var ufile = uploader.files[0]
		var uchunks = ufile.chunks
		expect(uchunks.length).toBe(10)
		uploader.upload()
		expect(ufile.progress()).toBe(0)
		for (var i = 0; i < 9; i++) {
			expect(requests[i]).toBeDefined()
			expect(ufile.isComplete()).toBeFalsy()
			expect(ufile.isUploading()).toBeTruthy()
			requests[i].respond(200)
			expect(ufile.progress()).toBe((i + 1) / 10)
			expect(ufile.isComplete()).toBeFalsy()
			expect(ufile.isUploading()).toBeTruthy()
		}
		expect(uchunks[0].progress()).toBe(1)
		var uchunk = uchunks[9]
		expect(requests[9]).toBeDefined()

		expect(uchunk.status()).toBe(Uploader.Uchunk.STATUS.UPLOADING)
		expect(ufile.isComplete()).toBeFalsy()
		expect(ufile.isUploading()).toBeTruthy()
		expect(ufile.progress()).toBe(0.9)
		expect(ufile.sizeUploaded()).toBe(9)
		requests[9].respond(200, null, 'ok')
		expect(ufile.isComplete()).toBeTruthy()
		expect(ufile.isUploading()).toBeFalsy()
		expect(uchunk.message()).toBe('ok')
		expect(uchunk.progress()).toBe(1)
		expect(ufile.progress()).toBe(1)
		expect(uchunk.sizeUploaded()).toBe(1)
		expect(ufile.sizeUploaded()).toBe(10)
		expect(uchunk.status()).toBe(Uploader.Uchunk.STATUS.SUCCESS)
	})

	it('upload errors', function () {
		uploader.opts.query = {}
		uploader.opts.target = 'file'
		uploader.opts.simultaneousUploads = 1
		uploader.opts.chunkSize = 5
		uploader.addFile(new File(['1111111111'], 'file.ddd'))
		var ufile = uploader.files[0]
		var uchunks = ufile.chunks
		expect(uchunks.length).toBe(2)
		uploader.upload()
		var req = requests[0]
		var req2 = requests[1]
		var uchunk = uchunks[0]
		var uchunk2 = uchunks[1]
		// TODO...
	})

})
