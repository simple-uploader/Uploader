var utils = require('./utils')
var Chunk = require('./chunk')

function File (uploader, file, parent) {
	this.uploader = uploader
	this.isRoot = this.isFolder = uploader === this
	this.parent = parent || null
	this.files = []
	this.fileList = []
	this.chunks = []

	if (this.isRoot || !file) {
		this.file = null
	} else {
		if (utils.isString(file)) {
			// folder
			this.isFolder = true
			this.file = null
			this.path = file
			if (this.parent.path) {
				file = file.substr(this.parent.path.length)
			}
			this.name = file.charAt(file.length - 1) === '/' ? file.substr(0, file.length - 1) : file
		} else {
			this.file = file
			this.fileType = this.file.type
			this.name = file.fileName || file.name
			this.size = file.size
			this.relativePath = file.relativePath || file.webkitRelativePath || this.name
			this._parseFile()
		}
	}

	this.paused = false
	this.errored = false
	this.aborted = false
	this.averageSpeed = 0
	this.currentSpeed = 0
	this._lastProgressCallback = Date.now()
	this._prevUploadedSize = 0
	this._prevProgress = 0

	this.bootstrap()
}

utils.extend(File.prototype, {

	_parseFile: function () {
		var ppaths = parsePaths(this.relativePath)
		if (ppaths.length) {
			var filePaths = this.uploader.filePaths
			utils.each(ppaths, function (path, i) {
				var folderFile = filePaths[path]
				if (!folderFile) {
					folderFile = new File(this.uploader, path, this.parent)
					filePaths[path] = folderFile
					this._updateParentFileList(folderFile)
				}
				this.parent = folderFile
				folderFile.files.push(this)
				if (!ppaths[i + 1]) {
					folderFile.fileList.push(this)
				}
			}, this)
		} else {
			this._updateParentFileList()
		}
	},

	_updateParentFileList: function (file) {
		if (!file) {
			file = this
		}
		var p = this.parent
		if (p) {
			p.fileList.push(file)
			// while (p && !p.isRoot) {
			// 	p.files.push(this)
			// 	p = p.parent
			// }
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
		this.errored = false
		// Rebuild stack of chunks from file
		this._prevProgress = 0
		var round = opts.forceChunkSize ? Math.ceil : Math.floor
		var chunks = Math.max(round(this.size / opts.chunkSize), 1)
		for (var offset = 0; offset < chunks; offset++) {
			this.chunks.push(new Chunk(this.uploader, this, offset))
		}
	},

	_measureSpeed: function () {
		var averageSpeeds = 0
		var currentSpeeds = 0
		var num = 0
		this._eachAccess(function (file) {
			if (!file.paused && !file.errored) {
				num += 1
				averageSpeeds += file.averageSpeed || 0
				currentSpeeds += file.currentSpeed || 0
			}
		}, function () {
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
		})
		if (this.isFolder) {
			if (num) {
				this.currentSpeed = currentSpeeds / num
				this.averageSpeed = averageSpeeds / num
			} else {
				this.currentSpeed = 0
				this.averageSpeed = 0
			}
		}
		if (this.parent) {
			this.parent._measureSpeed()
		}
	},

	_chunkEvent: function (chunk, evt, message) {
		var uploader = this.uploader
		var STATUS = Chunk.STATUS
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
				this.errored = true
				this.abort(true)
				uploader._trigger('fileError', this, message, chunk)
				uploader._trigger('error', message, this, chunk)
				break
			case STATUS.SUCCESS:
				if (this.errored) {
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
			var STATUS = Chunk.STATUS
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
			var uploadingStatus = Chunk.STATUS.UPLOADING
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
			this.aborted = false
			this.uploader.upload()
		})
		this.paused = false
		this.aborted = false
	},

	error: function (errored) {
		this.errored = errored

		if (this.parent) {
			this.parent.error(errored)
		}
	},

	pause: function () {
		this._eachAccess(function (f) {
			f.pause()
		}, function () {
			this.paused = true
			this.abort()
		})
		this.paused = true
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
				this.bootstrap()
			})
		}
		this.uploader.upload()
	},

	abort: function (reset) {
		if (this.aborted) {
			return
		}
		this.currentSpeed = 0
		this.averageSpeed = 0
		this.aborted = !reset
		var chunks = this.chunks
		if (reset) {
			this.chunks = []
		}
		var uploadingStatus = Chunk.STATUS.UPLOADING
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
		var ret = 0
		this._eachAccess(function (file, index) {
			totalDone += file.progress() * file.size
			totalSize += file.size
			if (index === this.files.length - 1) {
				ret = totalSize > 0 ? totalDone / totalSize : this.isComplete() ? 1 : 0
			}
		}, function () {
			if (this.errored) {
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

	getFormatSize: function () {
		var size = this.getSize()
		return utils.formatSize(size)
	},

	getRoot: function () {
		if (this.isRoot) {
			return this
		}
		var parent = this.parent
		while (parent) {
			if (parent.parent === this.uploader) {
				// find it
				return parent
			}
			parent = parent.parent
		}
		return this
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
		var ret = 0
		var sizeDelta = 0
		var averageSpeed = 0
		this._eachAccess(function (file, i) {
			if (!file.paused && !file.errored) {
				sizeDelta += file.size - file.sizeUploaded()
				averageSpeed += file.averageSpeed
			}
			if (i === this.files.length - 1) {
				ret = calRet(sizeDelta, averageSpeed)
			}
		}, function () {
			if (this.paused || this.errored) {
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
			while (file.files.length) {
				this._removeFile(file.files[file.files.length - 1])
			}
		}
		this._removeFile(file)
		this._delFilePath(file)
	},

	_delFilePath: function (file) {
		if (file.path && this.filePaths) {
			delete this.filePaths[file.path]
		}
		utils.each(file.fileList, function (file) {
			this._delFilePath(file)
		}, this)
	},

	_removeFile: function (file) {
		!file.isFolder && utils.each(this.files, function (f, i) {
			if (f === file) {
				this.files.splice(i, 1)
				file.abort()
				var parent = file.parent
				while (parent && parent !== this) {
					parent._removeFile(file)
					parent = parent.parent
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
		file.parent = null
	},

	getType: function () {
		if (this.isFolder) {
			return 'folder'
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

module.exports = File

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
