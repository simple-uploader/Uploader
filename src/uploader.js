var utils = require('./utils')
var event = require('./event')
var File = require('./file')
var Chunk = require('./chunk')

var version = '__VERSION__'

// ie10+
var ie10plus = window.navigator.msPointerEnabled
var support = (function () {
	var sliceName = 'slice'
	var _support = utils.isDefined(window.File) && utils.isDefined(window.Blob) &&
								utils.isDefined(window.FileList)
	var bproto = null
	if (_support) {
		bproto = window.Blob.prototype
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
	if (!this.support) {
		return
	}
	this.supportDirectory = supportDirectory
	this.filePaths = {}
	this.opts = utils.extend(Uploader.defaults, opts || {})

	File.call(this, this)
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
Uploader.event = event
Uploader.File = File
Uploader.Chunk = Chunk

// inherit file
Uploader.prototype = utils.extend({}, File.prototype)
// inherit event
utils.extend(Uploader.prototype, event)
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
		var _files = []
		var oldFileListLen = this.fileList.length
		utils.each(files, function (file) {
			// Uploading empty file IE10/IE11 hangs indefinitely
			// Directories have size `0` and name `.`
			// Ignore already added files if opts.allowDuplicateUploads is set to false
			if ((!ie10plus || ie10plus && file.size > 0) &&
					!(file.size % 4096 === 0 && (file.name === '.' || file.fileName === '.')) &&
					(this.opts.allowDuplicateUploads || !this.getFromUniqueIdentifier(this.generateUniqueIdentifier(file)))
			) {
				var _file = new File(this, file, this)
				if (this._trigger('fileAdded', _file, evt)) {
					_files.push(_file)
				}
			}
		}, this)
		if (!_files.length) {
			// no new files
			return
		}
		// get new fileList
		var newFileList = this.fileList.slice(oldFileListLen)
		if (this._trigger('filesAdded', _files, newFileList, evt)) {
			utils.each(_files, function (file) {
				if (this.opts.singleFile && this.files.length > 0) {
					this.removeFile(this.files[0])
				}
				this.files.push(file)
			}, this)
		}
		this._trigger('filesSubmitted', _files, newFileList, evt)
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
		var pendingStatus = Chunk.STATUS.PENDING
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
		var uploadingStatus = Chunk.STATUS.UPLOADING
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
