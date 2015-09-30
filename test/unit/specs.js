(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var utils = require('./utils')

function Uchunk (uploader, ufile, offset) {
	this.uploader = uploader
	this.ufile = ufile
	this.offset = offset
	this.tested = false
	this.retries = 0
	this.pendingRetry = false
	this.preprocessState = 0
	this.readState = 0
	this.loaded = 0
	this.total = 0
	this.chunkSize = this.uploader.opts.chunkSize
	this.startByte = this.offset * this.chunkSize
	this.endByte = Math.min(this.ufile.size, (this.offset + 1) * this.chunkSize)
	this.xhr = null
}

var STATUS = Uchunk.STATUS = {
	PENDING: 'pending',
	UPLOADING: 'uploading',
	READING: 'reading',
	SUCCESS: 'success',
	ERROR: 'error',
	COMPLETE: 'complete',
	PROGRESS: 'progress',
	RETRY: 'retry'
}

utils.extend(Uchunk.prototype, {

	_event: function (evt, args) {
		args = utils.toArray(arguments)
		args.unshift(this)
		this.ufile._chunkEvent.apply(this.ufile, args)
	},

	getParams: function () {
		return {
			uChunkNumber: this.offset + 1,
			uChunkSize: this.uploader.opts.chunkSize,
			uCurrentChunkSize: this.endByte - this.startByte,
			uTotalSize: this.ufile.size,
			uIdentifier: this.ufile.uniqueIdentifier,
			uFilename: this.ufile.name,
			uRelativePath: this.ufile.relativePath,
			uTotalChunks: this.ufile.chunks.length
		}
	},

	getTarget: function (target, params) {
		if (target.indexOf('?') < 0) {
			target += '?'
		} else {
			target += '&'
		}
		return target + params.join('&')
	},

	test: function () {
		this.xhr = new XMLHttpRequest()
		this.xhr.addEventListener('load', testHandler, false)
		this.xhr.addEventListener('error', testHandler, false)
		var testMethod = utils.evalOpts(this.uploader.opts.testMethod, this.ufile, this)
		var data = this.prepareXhrRequest(testMethod, true)
		this.xhr.send(data)

		var $ = this
		function testHandler (event) {
			var status = $.status(true)
			if (status === STATUS.ERROR) {
				$._event(status, $.message())
				$.uploader.uploadNextChunk()
			} else if (status === STATUS.SUCCESS) {
				$.tested = true
				$._event(status, $.message())
				$.uploader.uploadNextChunk()
			} else if (!$.ufile.paused) {
				// Error might be caused by file pause method
				// Chunks does not exist on the server side
				$.tested = true
				$.send()
			}
		}
	},

	preprocessFinished: function () {
		// Compute the endByte after the preprocess function to allow an
		// implementer of preprocess to set the fileObj size
		this.endByte = Math.min(this.ufile.size, (this.offset + 1) * this.chunkSize)
		if (this.ufile.size - this.endByte < this.chunkSize &&
				!this.uploader.opts.forceChunkSize) {
			// The last chunk will be bigger than the chunk size,
			// but less than 2*this.chunkSize
			this.endByte = this.ufile.size
		}
		this.preprocessState = 2
		this.send()
	},

	readFinished: function (bytes) {
		this.readState = 2
		this.bytes = bytes
		this.send()
	},

	send: function () {
		var preprocess = this.uploader.opts.preprocess
		var read = this.uploader.opts.readFileFn
		if (utils.isFunction(preprocess)) {
			switch (this.preprocessState) {
				case 0:
					this.preprocessState = 1
					preprocess(this)
					return
				case 1:
					return
			}
		}
		switch (this.readState) {
			case 0:
				this.readState = 1
				read(this.ufile, this.startByte, this.endByte, this.fileType, this)
				return
			case 1:
				return
		}
		if (this.uploader.opts.testChunks && !this.tested) {
			this.test()
			return
		}

		this.loaded = 0
		this.total = 0
		this.pendingRetry = false

		// Set up request and listen for event
		this.xhr = new XMLHttpRequest()
		this.xhr.upload.addEventListener('progress', progressHandler, false)
		this.xhr.addEventListener('load', doneHandler, false)
		this.xhr.addEventListener('error', doneHandler, false)

		var uploadMethod = utils.evalOpts(this.uploader.opts.uploadMethod, this.ufile, this)
		var data = this.prepareXhrRequest(uploadMethod, false, this.uploader.opts.method, this.bytes)
		this.xhr.send(data)

		var $ = this
		function progressHandler (event) {
			if (event.lengthComputable) {
				$.loaded = event.loaded
				$.total = event.total
			}
			$._event(STATUS.PROGRESS, event)
		}

		function doneHandler (event) {
			var status = $.status()
			if (status === STATUS.SUCCESS || status === STATUS.ERROR) {
				delete this.data
				$._event(status, $.message())
				$.uploader.uploadNextChunk()
			} else {
				$._event(STATUS.RETRY, $.message())
				$.pendingRetry = true
				$.abort()
				$.retries++
				var retryInterval = $.uploader.opts.chunkRetryInterval
				if (retryInterval !== null) {
					setTimeout(function () {
						$.send()
					}, retryInterval)
				} else {
					$.send()
				}
			}
		}
	},

	abort: function () {
		var xhr = this.xhr
		this.xhr = null
		if (xhr) {
			xhr.abort()
		}
	},

	status: function (isTest) {
		if (this.readState === 1) {
			return STATUS.READING
		} else if (this.pendingRetry || this.preprocessState === 1) {
			// if pending retry then that's effectively the same as actively uploading,
			// there might just be a slight delay before the retry starts
			return STATUS.UPLOADING
		} else if (!this.xhr) {
			return STATUS.PENDING
		} else if (this.xhr.readyState < 4) {
			// Status is really 'OPENED', 'HEADERS_RECEIVED'
			// or 'LOADING' - meaning that stuff is happening
			return STATUS.UPLOADING
		} else {
			if (this.uploader.opts.successStatuses.indexOf(this.xhr.status) > -1) {
				// HTTP 200, perfect
				// HTTP 202 Accepted - The request has been accepted for processing, but the processing has not been completed.
				return STATUS.SUCCESS
			} else if (this.uploader.opts.permanentErrors.indexOf(this.xhr.status) > -1 ||
					!isTest && this.retries >= this.uploader.opts.maxChunkRetries) {
				// HTTP 415/500/501, permanent error
				return STATUS.ERROR
			} else {
				// this should never happen, but we'll reset and queue a retry
				// a likely case for this would be 503 service unavailable
				this.abort()
				return STATUS.PENDING
			}
		}
	},

	message: function () {
		return this.xhr ? this.xhr.responseText : ''
	},

	progress: function () {
		if (this.pendingRetry) {
			return 0
		}
		var s = this.status()
		if (s === STATUS.SUCCESS || s === STATUS.ERROR) {
			return 1
		} else if (s === STATUS.PENDING) {
			return 0
		} else {
			return this.total > 0 ? this.loaded / this.total : 0
		}
	},

	sizeUploaded: function () {
		var size = this.endByte - this.startByte
		// can't return only chunk.loaded value, because it is bigger than chunk size
		if (this.status() !== STATUS.SUCCESS) {
			size = this.progress() * size
		}
		return size
	},

	prepareXhrRequest: function (method, isTest, paramsMethod, blob) {
		// Add data from the query options
		var query = utils.evalOpts(this.uploader.opts.query, this.ufile, this, isTest)
		query = utils.extend(this.getParams(), query)

		var target = utils.evalOpts(this.uploader.opts.target, this.ufile, this, isTest)
		var data = null
		if (method === 'GET' || paramsMethod === 'octet') {
			// Add data from the query options
			var params = []
			utils.each(query, function (v, k) {
				params.push([encodeURIComponent(k), encodeURIComponent(v)].join('='))
			})
			target = this.getTarget(target, params)
			data = blob || null
		} else {
			// Add data from the query options
			data = new FormData()
			utils.each(query, function (v, k) {
				data.append(k, v)
			})
			data.append(this.uploader.opts.fileParameterName, blob, this.ufile.name)
		}

		this.xhr.open(method, target, true)
		this.xhr.withCredentials = this.uploader.opts.withCredentials

		// Add data from header options
		utils.each(utils.evalOpts(this.uploader.opts.headers, this.ufile, this, isTest), function (v, k) {
			this.xhr.setRequestHeader(k, v)
		}, this)

		return data
	}

})

module.exports = Uchunk

},{"./utils":5}],2:[function(require,module,exports){
var each = require('./utils').each

var uevent = {

	_eventData: null,

	on: function (name, func) {
		if (!this._eventData) this._eventData = {}
		if (!this._eventData[name]) this._eventData[name] = []
		var listened = false
		each(this._eventData[name], function (fuc) {
			if (fuc === func) {
				listened = true
				return false
			}
		})
		if (!listened) {
			this._eventData[name].push(func)
		}
	},

	off: function (name, func) {
		if (!this._eventData) this._eventData = {}
		if (!this._eventData[name] || !this._eventData[name].length) return
		if (func) {
			each(this._eventData[name], function (fuc, i) {
				if (fuc === func) {
					this._eventData[name].splice(i, 1)
					return false
				}
			}, this)
		} else {
			this._eventData[name] = []
		}
	},

	trigger: function (name) {
		if (!this._eventData) this._eventData = {}
		if (!this._eventData[name]) return true
		var args = this._eventData[name].slice.call(arguments, 1)
		var preventDefault = false
		each(this._eventData[name], function (fuc) {
			preventDefault = fuc.apply(this, args) === false || preventDefault
		}, this)
		return !preventDefault
	}
}

module.exports = uevent

},{"./utils":5}],3:[function(require,module,exports){
var utils = require('./utils')
var Uchunk = require('./chunk')

function Ufile (uploader, file, parent) {
	this.uploader = uploader
	this.isRoot = this.isFolder = uploader === this
	this.parent = parent || null
	this.files = []
	this.fileList = []
	this.chunks = []
	this.bytes = null

	if (this.isRoot || !file) {
		this.file = null
	} else {
		if (utils.isString(file)) {
			// folder
			this.isFolder = true
			this.path = file
			if (this.parent.path) {
				file = file.substr(this.parent.path.length)
			}
			this.name = file.charAt(file.length - 1) === '/' ? file.substr(0, file.length - 1) : file
		} else {
			this.file = file
			this.name = file.fileName || file.name
			this.size = file.size
			this.relativePath = file.relativePath || file.webkitRelativePath || this.name
			this.uniqueIdentifier = uploader.generateUniqueIdentifier(file)
			this._parseFile()
		}
	}

	this.started = false
	this.paused = false
	this.error = false
	this.averageSpeed = 0
	this.currentSpeed = 0
	this._lastProgressCallback = Date.now()
	this._prevUploadedSize = 0
	this._prevProgress = 0

	this.bootstrap()
}

utils.extend(Ufile.prototype, {

	_parseFile: function () {
		var ppaths = parsePaths(this.relativePath)
		if (ppaths.length) {
			var filePaths = this.uploader.filePaths
			utils.each(ppaths, function (path, i) {
				var folderFile = filePaths[path]
				if (!folderFile) {
					folderFile = new Ufile(this.uploader, path, this.parent)
					filePaths[path] = folderFile
					this._updateParentFileList(folderFile)
				}
				this.parent = folderFile
				if (!ppaths[i + 1]) {
					folderFile.files.push(this)
					folderFile.fileList.push(this)
				}
			}, this)
		} else {
			this._updateParentFileList()
		}
	},

	_updateParentFileList: function (ufile) {
		if (!ufile) {
			ufile = this
		}
		var p = this.parent
		if (p) {
			p.fileList.push(ufile)
			while (p && !p.isRoot) {
				p.files.push(this)
				p = p.parent
			}
		}
	},

	_eachAccess: function (eachFn, fileFn) {
		if (this.isFolder) {
			utils.each(this.files, function (f, i) {
				return eachFn.call(this, f, i)
			}, this)
			return
		}
		if (!fileFn) {
			fileFn = eachFn
		}
		fileFn.call(this, this)
	},

	bootstrap: function () {
		if (this.isFolder) return
		var opts = this.uploader.opts
		if (utils.isFunction(opts.initFileFn)) {
			opts.initFileFn.call(this, this)
		}

		this.abort(true)
		this.error = false
		// Rebuild stack of chunks from file
		this._prevProgress = 0
		var round = opts.forceChunkSize ? Math.ceil : Math.floor
		var chunks = Math.max(round(this.size / opts.chunkSize), 1)
		for (var offset = 0; offset < chunks; offset++) {
			this.chunks.push(new Uchunk(this.uploader, this, offset))
		}
	},

	_measureSpeed: function () {
		var timeSpan = Date.now() - this._lastProgressCallback
		if (!timeSpan) {
			return
		}
		var smoothingFactor = this.uploader.opts.speedSmoothingFactor
		var uploaded = this.sizeUploaded()
		// Prevent negative upload speed after file upload resume
		this.currentSpeed = Math.max((uploaded - this._prevUploadedSize) / timeSpan * 1000, 0)
		this.averageSpeed = smoothingFactor * this.currentSpeed + (1 - smoothingFactor) * this.averageSpeed
		this._prevUploadedSize = uploaded
	},

	_chunkEvent: function (chunk, evt, message) {
		var uploader = this.uploader
		var STATUS = Uchunk.STATUS
		switch (evt) {
			case STATUS.PROGRESS:
				if (Date.now() - this._lastProgressCallback < uploader.opts.progressCallbacksInterval) {
					break
				}
				this._measureSpeed()
				uploader._trigger('fileProgress', this, chunk)
				uploader._trigger('progress')
				this._lastProgressCallback = Date.now()
				break
			case STATUS.ERROR:
				this.error = true
				this.abort(true)
				uploader._trigger('fileError', this, message, chunk)
				uploader._trigger('error', message, this, chunk)
				break
			case STATUS.SUCCESS:
				if (this.error) {
					return
				}
				this._measureSpeed()
				uploader._trigger('fileProgress', this, chunk)
				uploader._trigger('progress')
				this._lastProgressCallback = Date.now()
				if (this.isComplete()) {
					this.currentSpeed = 0
					this.averageSpeed = 0
					uploader._trigger('fileSuccess', this, message, chunk)
				}
				break
			case STATUS.RETRY:
				uploader._trigger('fileRetry', this, chunk)
				break
		}
	},

	isComplete: function () {
		var outstanding = false
		this._eachAccess(function (file) {
			if (!file.isComplete()) {
				outstanding = true
				return false
			}
		}, function () {
			var STATUS = Uchunk.STATUS
			utils.each(this.chunks, function (chunk) {
				var status = chunk.status()
				if (status === STATUS.PENDING || status === STATUS.UPLOADING || status === STATUS.READING || chunk.preprocessState === 1 || chunk.readState === 1) {
					outstanding = true
					return false
				}
			})
		})
		return !outstanding
	},

	isUploading: function () {
		var uploading = false
		this._eachAccess(function (file) {
			if (file.isUploading()) {
				uploading = true
				return false
			}
		}, function () {
			var uploadingStatus = Uchunk.STATUS.UPLOADING
			utils.each(this.chunks, function (chunk) {
				if (chunk.status() === uploadingStatus) {
					uploading = true
					return false
				}
			})
		})
		return uploading
	},

	resume: function () {
		this._eachAccess(function (f) {
			f.resume()
		}, function () {
			this.paused = false
			this.uploader.upload()
		})
	},

	pause: function () {
		this._eachAccess(function (f) {
			f.pause()
		}, function () {
			this.paused = true
			this.abort()
		})
	},

	cancel: function () {
		if (this.isFolder) {
			for (var i = this.files.length - 1; i >= 0; i--) {
				this.files[i].cancel()
			}
			return
		}
		this.uploader.removeFile(this)
	},

	retry: function (file) {
		if (file) {
			file.bootstrap()
		} else {
			this._eachAccess(function (f) {
				f.bootstrap()
			}, function () {
				this.file.bootstrap()
			})
		}
		this.uploader.upload()
	},

	abort: function (reset) {
		this.currentSpeed = 0
		this.averageSpeed = 0
		var chunks = this.chunks
		if (reset) {
			this.chunks = []
		}
		var uploadingStatus = Uchunk.STATUS.UPLOADING
		utils.each(chunks, function (c) {
			if (c.status() === uploadingStatus) {
				c.abort()
				this.uploader.uploadNextChunk()
			}
		}, this)
	},

	progress: function () {
		var totalDone = 0
		var totalSize = 0
		var ret
		this._eachAccess(function (file, index) {
			totalDone += file.progress() * file.size
			totalSize += file.size
			if (index === this.files.length - 1) {
				ret = totalSize > 0 ? totalDone / totalSize
						: this.isComplete() ? 1 : 0
			}
		}, function () {
			if (this.error) {
				ret = 1
				return
			}
			if (this.chunks.length === 1) {
				this._prevProgress = Math.max(this._prevProgress, this.chunks[0].progress())
				ret = this._prevProgress
				return
			}
			// Sum up progress across everything
			var bytesLoaded = 0
			utils.each(this.chunks, function (c) {
				// get chunk progress relative to entire file
				bytesLoaded += c.progress() * (c.endByte - c.startByte)
			})
			var percent = bytesLoaded / this.size
			// We don't want to lose percentages when an upload is paused
			this._prevProgress = Math.max(this._prevProgress, percent > 0.9999 ? 1 : percent)
			ret = this._prevProgress
		})
		return ret
	},

	getSize: function () {
		var size = 0
		this._eachAccess(function (file) {
			size += file.size
		}, function () {
			size += this.size
		})
		return size
	},

	sizeUploaded: function () {
		var size = 0
		this._eachAccess(function (file) {
			size += file.sizeUploaded()
		}, function () {
			utils.each(this.chunks, function (chunk) {
				size += chunk.sizeUploaded()
			})
		})
		return size
	},

	timeRemaining: function () {
		var ret
		var sizeDelta = 0
		var averageSpeed = 0
		this._eachAccess(function (file, i) {
			if (!file.paused && !file.error) {
				sizeDelta += file.size - file.sizeUploaded()
				averageSpeed += file.averageSpeed
			}
			if (i === this.files.length - 1) {
				ret = calRet(sizeDelta, averageSpeed)
			}
		}, function () {
			if (this.paused || this.error) {
				ret = 0
				return
			}
			var delta = this.size - this.sizeUploaded()
			ret = calRet(delta, this.averageSpeed)
		})
		return ret
		function calRet (delta, averageSpeed) {
			if (delta && !averageSpeed) {
				return Number.POSITIVE_INFINITY
			}
			if (!delta && !averageSpeed) {
				return 0
			}
			return Math.floor(delta / averageSpeed)
		}
	},

	removeFile: function (file) {
		if (file.isFolder) {
			if (file.parent) {
				file.parent._removeFile(file)
			}
			utils.each(file.files, function (f) {
				this.removeFile(f)
			}, this)
			return
		}
		utils.each(this.files, function (f, i) {
			if (f === file) {
				this.files.splice(i, 1)
				file.abort()
				if (file.parent) {
					file.parent._removeFile(file)
				}
				return false
			}
		}, this)
	},

	_removeFile: function (file) {
		!file.isFolder && utils.each(this.files, function (f, i) {
			if (f === file) {
				this.files.splice(i, 1)
				if (this.parent) {
					this.parent._removeFile(file)
				}
				return false
			}
		}, this)
		file.parent === this && utils.each(this.fileList, function (f, i) {
			if (f === file) {
				this.fileList.splice(i, 1)
				return false
			}
		}, this)
	},

	getType: function () {
		if (this.isFolder) {
			return 'Folder'
		}
		return this.file.type && this.file.type.split('/')[1]
	},

	getExtension: function () {
		if (this.isFolder) {
			return ''
		}
		return this.name.substr((~-this.name.lastIndexOf('.') >>> 0) + 2).toLowerCase()
	}

})

module.exports = Ufile

function parsePaths (path) {
	var ret = []
	var paths = path.split('/')
	var len = paths.length
	var i = 1
	paths.splice(len - 1, 1)
	len--
	if (paths.length) {
		while (i <= len) {
			ret.push(paths.slice(0, i++).join('/') + '/')
		}
	}
	return ret
}

},{"./chunk":1,"./utils":5}],4:[function(require,module,exports){
var utils = require('./utils')
var uevent = require('./event')
var Ufile = require('./file')
var Uchunk = require('./chunk')

var version = '__VERSION__'

// ie10+
var ie10plus = window.navigator.msPointerEnabled
var support = (function () {
	var sliceName = 'slice'
	var _support = utils.isDefined(File) && utils.isDefined(Blob) &&
								utils.isDefined(FileList)
	var bproto = null
	if (_support) {
		bproto = Blob.prototype
		utils.each(['slice', 'webkitSlice', 'mozSlice'], function (n) {
			if (bproto[n]) {
				sliceName = n
				return false
			}
		})
		_support = !!bproto[sliceName]
	}
	if (_support) Uploader.sliceName = sliceName
	bproto = null
	return _support
})()

var supportDirectory = (function () {
	var input = window.document.createElement('input')
	input.type = 'file'
	var sd = 'webkitdirectory' in input || 'directory' in input
	input = null
	return sd
})()

function Uploader (opts) {
	this.support = support
	if (!this.support || ie10plus) {
		return
	}
	this.supportDirectory = supportDirectory
	this.filePaths = {}
	this.opts = utils.extend(Uploader.defaults, opts || {})

	Ufile.call(this, this)
}

/**
 * Default read function using the webAPI
 *
 * @function webAPIFileRead(fileObj, fileType, startByte, endByte, chunk)
 *
 */
var webAPIFileRead = function (fileObj, fileType, startByte, endByte, chunk) {
	var function_name = 'slice'

	if (fileObj.file.slice) {
		function_name = 'slice'
	} else if (fileObj.file.mozSlice) {
		function_name = 'mozSlice'
	} else if (fileObj.file.webkitSlice) {
		function_name = 'webkitSlice'
	}
	chunk.readFinished(fileObj.file[function_name](startByte, endByte, fileType))
}

Uploader.version = version

Uploader.defaults = {
	chunkSize: 1024 * 1024,
	forceChunkSize: false,
	simultaneousUploads: 3,
	singleFile: false,
	fileParameterName: 'file',
	progressCallbacksInterval: 500,
	speedSmoothingFactor: 0.1,
	query: {},
	headers: {},
	withCredentials: false,
	preprocess: null,
	method: 'multipart',
	testMethod: 'GET',
	uploadMethod: 'POST',
	prioritizeFirstAndLastChunk: false,
	allowDuplicateUploads: false,
	target: '/',
	testChunks: true,
	generateUniqueIdentifier: null,
	maxChunkRetries: 0,
	chunkRetryInterval: null,
	permanentErrors: [404, 415, 500, 501],
	successStatuses: [200, 201, 202],
	onDropStopPropagation: false,
	initFileFn: null,
	readFileFn: webAPIFileRead
}

Uploader.utils = utils
Uploader.uevent = uevent
Uploader.Ufile = Ufile
Uploader.Uchunk = Uchunk

// inherit Ufile
Uploader.prototype = utils.extend({}, Ufile.prototype)
// inherit event
utils.extend(Uploader.prototype, uevent)
utils.extend(Uploader.prototype, {

	constructor: Uploader,

	_trigger: function (name) {
		var args = utils.toArray(arguments, 1)
		var preventDefault = !this.trigger.apply(this, arguments)
		if (name !== 'catchAll') {
			args.unshift('catchAll')
			preventDefault = !this.trigger.apply(this, args) || preventDefault
		}
		return !preventDefault
	},

	_triggerAsync: function () {
		var args = arguments
		utils.nextTick(function () {
			this._trigger.apply(this, args)
		}, this)
	},

	onDrop: function (evt) {
		if (this.opts.onDropStopPropagation) {
			evt.stopPropagation()
		}
		evt.preventDefault()
		var dataTransfer = evt.dataTransfer
		if (dataTransfer.items && dataTransfer.items[0] &&
			dataTransfer.items[0].webkitGetAsEntry) {
			this.webkitReadDataTransfer(evt)
		} else {
			this.addFiles(dataTransfer.files, evt)
		}
	},

	webkitReadDataTransfer: function (evt) {
		var self = this
		var queue = evt.dataTransfer.items.length
		var files = []
		utils.each(evt.dataTransfer.items, function (item) {
			var entry = item.webkitGetAsEntry()
			if (!entry) {
				decrement()
				return
			}
			if (entry.isFile) {
				// due to a bug in Chrome's File System API impl - #149735
				fileReadSuccess(item.getAsFile(), entry.fullPath)
			} else {
				readDirectory(entry.createReader())
			}
		})
		function readDirectory (reader) {
			reader.readEntries(function (entries) {
				if (entries.length) {
					queue += entries.length
					utils.each(entries, function (entry) {
						if (entry.isFile) {
							var fullPath = entry.fullPath
							entry.file(function (file) {
								fileReadSuccess(file, fullPath)
							}, readError)
						} else if (entry.isDirectory) {
							readDirectory(entry.createReader())
						}
					})
					readDirectory(reader)
				} else {
					decrement()
				}
			}, readError)
		}
		function fileReadSuccess (file, fullPath) {
			// relative path should not start with "/"
			file.relativePath = fullPath.substring(1)
			files.push(file)
			decrement()
		}
		function readError (fileError) {
			throw fileError
		}
		function decrement () {
			if (--queue === 0) {
				self.addFiles(files, evt)
			}
		}
	},

	addFiles: function (files, evt) {
		var ufiles = []
		utils.each(files, function (file) {
			// Uploading empty file IE10/IE11 hangs indefinitely
			// Directories have size `0` and name `.`
			// Ignore already added files if opts.allowDuplicateUploads is set to false
			if ((!ie10plus || ie10plus && file.size > 0) &&
					!(file.size % 4096 === 0 && (file.name === '.' || file.fileName === '.')) &&
					(this.opts.allowDuplicateUploads || !this.getFromUniqueIdentifier(this.generateUniqueIdentifier(file)))
				) {
				var ufile = new Ufile(this, file, this)
				if (this._trigger('fileAdded', ufile, evt)) {
					ufiles.push(ufile)
				}
			}
		}, this)
		if (this._trigger('filesAdded', ufiles, evt)) {
			utils.each(ufiles, function (file) {
				if (this.opts.singleFile && this.files.length > 0) {
					this.removeFile(this.files[0])
				}
				this.files.push(file)
			}, this)
		}
		this._trigger('filesSubmitted', ufiles, evt)
	},

	addFile: function (file, evt) {
		this.addFiles([file], evt)
	},

	generateUniqueIdentifier: function (file) {
		var custom = this.opts.generateUniqueIdentifier
		if (utils.isFunction(custom === 'function')) {
			return custom(file)
		}
		// Some confusion in different versions of Firefox
		var relativePath = file.relativePath || file.webkitRelativePath || file.fileName || file.name
		return file.size + '-' + relativePath.replace(/[^0-9a-zA-Z_-]/img, '')
	},

	getFromUniqueIdentifier: function (uniqueIdentifier) {
		var ret = false
		utils.each(this.files, function (file) {
			if (file.uniqueIdentifier === uniqueIdentifier) {
				ret = file
				return false
			}
		})
		return ret
	},

	uploadNextChunk: function (preventEvents) {
		var found = false
		var pendingStatus = Uchunk.STATUS.PENDING
		if (this.opts.prioritizeFirstAndLastChunk) {
			utils.each(this.files, function (file) {
				if (!file.paused && file.chunks.length &&
					file.chunks[0].status() === pendingStatus) {
					file.chunks[0].send()
					found = true
					return false
				}
				if (!file.paused && file.chunks.length > 1 &&
					file.chunks[file.chunks.length - 1].status() === pendingStatus) {
					file.chunks[file.chunks.length - 1].send()
					found = true
					return false
				}
			})
			if (found) {
				return found
			}
		}

		// Now, simply look for the next, best thing to upload
		utils.each(this.files, function (file) {
			if (!file.paused) {
				utils.each(file.chunks, function (chunk) {
					if (chunk.status() === pendingStatus) {
						chunk.send()
						found = true
						return false
					}
				})
			}
			if (found) {
				return false
			}
		})
		if (found) {
			return true
		}

		// The are no more outstanding chunks to upload, check is everything is done
		var outstanding = false
		utils.each(this.files, function (file) {
			if (!file.isComplete()) {
				outstanding = true
				return false
			}
		})
		if (!outstanding && !preventEvents) {
			// All chunks have been uploaded, complete
			this._triggerAsync('complete')
		}
		return false
	},

	upload: function () {
		// Make sure we don't start too many uploads at once
		var ret = this._shouldUploadNext()
		if (ret === false) {
			return
		}
		this._trigger('uploadStart')
		var started = false
		for (var num = 1; num <= this.opts.simultaneousUploads - ret; num++) {
			started = this.uploadNextChunk(true) || started
		}
		if (!started) {
			this._triggerAsync('complete')
		}
	},

	/**
	 * should upload next chunk
	 * @function
	 * @returns {Boolean|Number}
	 */
	_shouldUploadNext: function () {
		var num = 0
		var should = true
		var simultaneousUploads = this.opts.simultaneousUploads
		var uploadingStatus = Uchunk.STATUS.UPLOADING
		utils.each(this.files, function (file) {
			if (file.isComplete()) {
				return
			}
			utils.each(file.chunks, function (chunk) {
				if (chunk.status() === uploadingStatus) {
					num++
					if (num >= simultaneousUploads) {
						should = false
						return false
					}
				}
			})
		})
		// if should is true then return uploading chunks's length
		return should && num
	},

	/**
	 * Assign a browse action to one or more DOM nodes.
	 * @function
	 * @param {Element|Array.<Element>} domNodes
	 * @param {boolean} isDirectory Pass in true to allow directories to
	 * @param {boolean} singleFile prevent multi file upload
	 * @param {Object} attributes set custom attributes:
	 *  http://www.w3.org/TR/html-markup/input.file.html#input.file-attributes
	 *  eg: accept: 'image/*'
	 * be selected (Chrome only).
	 */
	assignBrowse: function (domNodes, isDirectory, singleFile, attributes) {
		if (typeof domNodes.length === 'undefined') {
			domNodes = [domNodes]
		}

		utils.each(domNodes, function (domNode) {
			var input
			if (domNode.tagName === 'INPUT' && domNode.type === 'file') {
				input = domNode
			} else {
				input = document.createElement('input')
				input.setAttribute('type', 'file')
				// display:none - not working in opera 12
				utils.extend(input.style, {
					visibility: 'hidden',
					position: 'absolute',
					width: '1px',
					height: '1px'
				})
				// for opera 12 browser, input must be assigned to a document
				domNode.appendChild(input)
				// https://developer.mozilla.org/en/using_files_from_web_applications)
				// event listener is executed two times
				// first one - original mouse click event
				// second - input.click(), input is inside domNode
				domNode.addEventListener('click', function () {
					input.click()
				}, false)
			}
			if (!this.opts.singleFile && !singleFile) {
				input.setAttribute('multiple', 'multiple')
			}
			if (isDirectory) {
				input.setAttribute('webkitdirectory', 'webkitdirectory')
			}
			attributes && utils.each(attributes, function (value, key) {
				input.setAttribute(key, value)
			})
			// When new files are added, simply append them to the overall list
			var that = this
			input.addEventListener('change', function (e) {
				if (e.target.value) {
					that.addFiles(e.target.files, e)
					e.target.value = ''
				}
			}, false)
		}, this)
	},

	/**
	 * Assign one or more DOM nodes as a drop target.
	 * @function
	 * @param {Element|Array.<Element>} domNodes
	 */
	assignDrop: function (domNodes) {
		if (typeof domNodes.length === 'undefined') {
			domNodes = [domNodes]
		}
		this._onDrop = utils.bind(this.onDrop, this)
		utils.each(domNodes, function (domNode) {
			domNode.addEventListener('dragover', utils.preventEvent, false)
			domNode.addEventListener('dragenter', utils.preventEvent, false)
			domNode.addEventListener('drop', this._onDrop, false)
		}, this)
	},

	/**
	 * Un-assign drop event from DOM nodes
	 * @function
	 * @param domNodes
	 */
	unAssignDrop: function (domNodes) {
		if (typeof domNodes.length === 'undefined') {
			domNodes = [domNodes]
		}
		utils.each(domNodes, function (domNode) {
			domNode.removeEventListener('dragover', utils.preventEvent, false)
			domNode.removeEventListener('dragenter', utils.preventEvent, false)
			domNode.removeEventListener('drop', this._onDrop, false)
			this._onDrop = null
		}, this)
	}

})

module.exports = Uploader

},{"./chunk":1,"./event":2,"./file":3,"./utils":5}],5:[function(require,module,exports){
var oproto = Object.prototype
var aproto = Array.prototype
var serialize = oproto.toString

var isFunction = function (fn) {
	return serialize.call(fn) === '[object Function]'
}

var isArray = Array.isArray || function (ary) {
	return serialize.call(ary) === '[object Array]'
}

var isPlainObject = function (obj) {
	return serialize.call(obj) === '[object Object]' && Object.getPrototypeOf(obj) === oproto
}

var utils = {

	noop: function () {},
	bind: function (fn, context) {
		return function () {
			return fn.apply(context, arguments)
		}
	},
	preventEvent: function (evt) {
		evt.preventDefault()
	},
	stop: function (evt) {
		evt.preventDefault()
		evt.stopPropagation()
	},
	nextTick: function (fn, context) {
		setTimeout(utils.bind(fn, context), 0)
	},
	toArray: function (ary, start, end) {
		if (start === undefined) start = 0
		if (end === undefined) end = ary.length
		return aproto.slice.call(ary, start, end)
	},

	isPlainObject: isPlainObject,
	isFunction: isFunction,
	isArray: isArray,
	isObject: function (obj) {
		return Object(obj) === obj
	},
	isString: function (s) {
		return typeof s === 'string'
	},
	isUndefined: function (a) {
		return typeof a === 'undefined'
	},
	isDefined: function (a) {
		return typeof a !== 'undefined'
	},

	each: function (ary, func, context) {
		for (var i = 0, len = ary.length; i < len; i++) {
			if (func.call(context, ary[i], i, ary) === false) {
				break
			}
		}
	},

	/**
	 * If option is a function, evaluate it with given params
	 * @param {*} data
	 * @param {...} args arguments of a callback
	 * @returns {*}
	 */
	evalOpts: function (data, args) {
		if (utils.isFunction(data)) {
			// `arguments` is an object, not array, in FF, so:
			args = utils.toArray(arguments)
			data = data.apply(null, args.slice(1))
		}
		return data
	},

	extend: function () {
		var options
		var name
		var src
		var copy
		var copyIsArray
		var clone
		var target = arguments[0] || {}
		var i = 1
		var length = arguments.length
		var force = false

		// 如果第一个参数为布尔,判定是否深拷贝
		if (typeof target === 'boolean') {
			force = target
			target = arguments[1] || {}
			i++
		}

		// 确保接受方为一个复杂的数据类型
		if (typeof target !== 'object' && !isFunction(target)) {
			target = {}
		}

		// 如果只有一个参数，那么新成员添加于 extend 所在的对象上
		if (i === length) {
			target = this
			i--
		}

		for (; i < length; i++) {
			// 只处理非空参数
			if ((options = arguments[i]) != null) {
				for (name in options) {
					src = target[name]
					copy = options[name]

					// 防止环引用
					if (target === copy) {
						continue
					}
					if (force && copy && (isPlainObject(copy) || (copyIsArray = isArray(copy)))) {
						if (copyIsArray) {
							copyIsArray = false
							clone = src && isArray(src) ? src : []
						} else {
							clone = src && isPlainObject(src) ? src : {}
						}
						target[name] = utils.extend(force, clone, copy)
					} else if (copy !== undefined) {
						target[name] = copy
					}
				}
			}
		}
		return target
	}
}

module.exports = utils

},{}],6:[function(require,module,exports){
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

},{"../../../src/uploader":4}]},{},[6]);(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var each = require('./utils').each

var uevent = {

	_eventData: null,

	on: function (name, func) {
		if (!this._eventData) this._eventData = {}
		if (!this._eventData[name]) this._eventData[name] = []
		var listened = false
		each(this._eventData[name], function (fuc) {
			if (fuc === func) {
				listened = true
				return false
			}
		})
		if (!listened) {
			this._eventData[name].push(func)
		}
	},

	off: function (name, func) {
		if (!this._eventData) this._eventData = {}
		if (!this._eventData[name] || !this._eventData[name].length) return
		if (func) {
			each(this._eventData[name], function (fuc, i) {
				if (fuc === func) {
					this._eventData[name].splice(i, 1)
					return false
				}
			}, this)
		} else {
			this._eventData[name] = []
		}
	},

	trigger: function (name) {
		if (!this._eventData) this._eventData = {}
		if (!this._eventData[name]) return true
		var args = this._eventData[name].slice.call(arguments, 1)
		var preventDefault = false
		each(this._eventData[name], function (fuc) {
			preventDefault = fuc.apply(this, args) === false || preventDefault
		}, this)
		return !preventDefault
	}
}

module.exports = uevent

},{"./utils":2}],2:[function(require,module,exports){
var oproto = Object.prototype
var aproto = Array.prototype
var serialize = oproto.toString

var isFunction = function (fn) {
	return serialize.call(fn) === '[object Function]'
}

var isArray = Array.isArray || function (ary) {
	return serialize.call(ary) === '[object Array]'
}

var isPlainObject = function (obj) {
	return serialize.call(obj) === '[object Object]' && Object.getPrototypeOf(obj) === oproto
}

var utils = {

	noop: function () {},
	bind: function (fn, context) {
		return function () {
			return fn.apply(context, arguments)
		}
	},
	preventEvent: function (evt) {
		evt.preventDefault()
	},
	stop: function (evt) {
		evt.preventDefault()
		evt.stopPropagation()
	},
	nextTick: function (fn, context) {
		setTimeout(utils.bind(fn, context), 0)
	},
	toArray: function (ary, start, end) {
		if (start === undefined) start = 0
		if (end === undefined) end = ary.length
		return aproto.slice.call(ary, start, end)
	},

	isPlainObject: isPlainObject,
	isFunction: isFunction,
	isArray: isArray,
	isObject: function (obj) {
		return Object(obj) === obj
	},
	isString: function (s) {
		return typeof s === 'string'
	},
	isUndefined: function (a) {
		return typeof a === 'undefined'
	},
	isDefined: function (a) {
		return typeof a !== 'undefined'
	},

	each: function (ary, func, context) {
		for (var i = 0, len = ary.length; i < len; i++) {
			if (func.call(context, ary[i], i, ary) === false) {
				break
			}
		}
	},

	/**
	 * If option is a function, evaluate it with given params
	 * @param {*} data
	 * @param {...} args arguments of a callback
	 * @returns {*}
	 */
	evalOpts: function (data, args) {
		if (utils.isFunction(data)) {
			// `arguments` is an object, not array, in FF, so:
			args = utils.toArray(arguments)
			data = data.apply(null, args.slice(1))
		}
		return data
	},

	extend: function () {
		var options
		var name
		var src
		var copy
		var copyIsArray
		var clone
		var target = arguments[0] || {}
		var i = 1
		var length = arguments.length
		var force = false

		// 如果第一个参数为布尔,判定是否深拷贝
		if (typeof target === 'boolean') {
			force = target
			target = arguments[1] || {}
			i++
		}

		// 确保接受方为一个复杂的数据类型
		if (typeof target !== 'object' && !isFunction(target)) {
			target = {}
		}

		// 如果只有一个参数，那么新成员添加于 extend 所在的对象上
		if (i === length) {
			target = this
			i--
		}

		for (; i < length; i++) {
			// 只处理非空参数
			if ((options = arguments[i]) != null) {
				for (name in options) {
					src = target[name]
					copy = options[name]

					// 防止环引用
					if (target === copy) {
						continue
					}
					if (force && copy && (isPlainObject(copy) || (copyIsArray = isArray(copy)))) {
						if (copyIsArray) {
							copyIsArray = false
							clone = src && isArray(src) ? src : []
						} else {
							clone = src && isPlainObject(src) ? src : {}
						}
						target[name] = utils.extend(force, clone, copy)
					} else if (copy !== undefined) {
						target[name] = copy
					}
				}
			}
		}
		return target
	}
}

module.exports = utils

},{}],3:[function(require,module,exports){
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

},{"../../../src/event":1,"../../../src/utils":2}]},{},[3]);(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var oproto = Object.prototype
var aproto = Array.prototype
var serialize = oproto.toString

var isFunction = function (fn) {
	return serialize.call(fn) === '[object Function]'
}

var isArray = Array.isArray || function (ary) {
	return serialize.call(ary) === '[object Array]'
}

var isPlainObject = function (obj) {
	return serialize.call(obj) === '[object Object]' && Object.getPrototypeOf(obj) === oproto
}

var utils = {

	noop: function () {},
	bind: function (fn, context) {
		return function () {
			return fn.apply(context, arguments)
		}
	},
	preventEvent: function (evt) {
		evt.preventDefault()
	},
	stop: function (evt) {
		evt.preventDefault()
		evt.stopPropagation()
	},
	nextTick: function (fn, context) {
		setTimeout(utils.bind(fn, context), 0)
	},
	toArray: function (ary, start, end) {
		if (start === undefined) start = 0
		if (end === undefined) end = ary.length
		return aproto.slice.call(ary, start, end)
	},

	isPlainObject: isPlainObject,
	isFunction: isFunction,
	isArray: isArray,
	isObject: function (obj) {
		return Object(obj) === obj
	},
	isString: function (s) {
		return typeof s === 'string'
	},
	isUndefined: function (a) {
		return typeof a === 'undefined'
	},
	isDefined: function (a) {
		return typeof a !== 'undefined'
	},

	each: function (ary, func, context) {
		for (var i = 0, len = ary.length; i < len; i++) {
			if (func.call(context, ary[i], i, ary) === false) {
				break
			}
		}
	},

	/**
	 * If option is a function, evaluate it with given params
	 * @param {*} data
	 * @param {...} args arguments of a callback
	 * @returns {*}
	 */
	evalOpts: function (data, args) {
		if (utils.isFunction(data)) {
			// `arguments` is an object, not array, in FF, so:
			args = utils.toArray(arguments)
			data = data.apply(null, args.slice(1))
		}
		return data
	},

	extend: function () {
		var options
		var name
		var src
		var copy
		var copyIsArray
		var clone
		var target = arguments[0] || {}
		var i = 1
		var length = arguments.length
		var force = false

		// 如果第一个参数为布尔,判定是否深拷贝
		if (typeof target === 'boolean') {
			force = target
			target = arguments[1] || {}
			i++
		}

		// 确保接受方为一个复杂的数据类型
		if (typeof target !== 'object' && !isFunction(target)) {
			target = {}
		}

		// 如果只有一个参数，那么新成员添加于 extend 所在的对象上
		if (i === length) {
			target = this
			i--
		}

		for (; i < length; i++) {
			// 只处理非空参数
			if ((options = arguments[i]) != null) {
				for (name in options) {
					src = target[name]
					copy = options[name]

					// 防止环引用
					if (target === copy) {
						continue
					}
					if (force && copy && (isPlainObject(copy) || (copyIsArray = isArray(copy)))) {
						if (copyIsArray) {
							copyIsArray = false
							clone = src && isArray(src) ? src : []
						} else {
							clone = src && isPlainObject(src) ? src : {}
						}
						target[name] = utils.extend(force, clone, copy)
					} else if (copy !== undefined) {
						target[name] = copy
					}
				}
			}
		}
		return target
	}
}

module.exports = utils

},{}],2:[function(require,module,exports){
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
	})

})

},{"../../../src/utils":1}]},{},[2])