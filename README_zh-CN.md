# simple-uploader.js [![Build Status](https://travis-ci.org/simple-uploader/Uploader.svg?branch=master)](https://travis-ci.org/simple-uploader/Uploader?branch=master) [![codecov.io](http://codecov.io/github/simple-uploader/Uploader/coverage.svg?branch=master)](http://codecov.io/github/simple-uploader/Uploader?branch=master) [![Build Status](https://saucelabs.com/buildstatus/uploader)](https://saucelabs.com/u/uploader)

[![Sauce Test Status](https://saucelabs.com/browser-matrix/uploader.svg)](https://saucelabs.com/u/uploader)

![QQ](https://github.com/simple-uploader/Uploader/blob/develop/assets/simple-uploader-QQ-2.png?raw=true)

simple-uploader.js（也称 Uploader) 是一个上传库，支持多并发上传，文件夹、拖拽、可暂停继续、秒传、分块上传、出错自动重传、手工重传、进度、剩余时间、上传速度等特性；该上传库依赖 HTML5 File API。

Fork [flow.js](https://github.com/flowjs/flow.js)，但是进行了重构。

由于是分块上传，所以依赖文件的分块 API，所以受限于此浏览器支持程度为：Firefox 4+, Chrome 11+, Safari 6+ and Internet Explorer 10+。

默认提供了一个 Node.js 的示例，放在 `samples/` 目录下。

## 相比 flow.js 的新特性

* 统一把文件和文件夹对待为 `Uploader.File`，统一管理

* `Uploader` 本身其实就是一个根文件夹

* 新增 `fileList` 属性，用来存文件和文件夹合集，只包含根下的文件和文件夹。

## 安装

从 https://github.com/simple-uploader/Uploader/releases/ 下载最新的发布版本，里边的 `dist/` 文件夹下包含了打包后文件。

也可使用 npm：

```console
npm install simple-uploader.js
```

或者直接 git clone：

```console
git clone https://github.com/simple-uploader/Uploader
```

## 使用

创建一个  `Uploader` 实例：

```javascript
var uploader = new Uploader({
  target: '/api/photo/redeem-upload-token', 
  query: { upload_token: 'my_token' }
})
// 如果不支持 需要降级的地方
if (!uploader.support) location.href = '/some-old-crappy-uploader'
```

如果想要选择文件或者拖拽文件的话，你可以通过如下两个 API 来指定哪些 DOM 节点：

```javascript
uploader.assignBrowse(document.getElementById('browseButton'))
uploader.assignDrop(document.getElementById('dropTarget'))
```

实例化后你还可以选择监听一些事件：

```javascript
// 文件添加 单个文件
uploader.on('fileAdded', function (file, event) {
  console.log(file, event)
})
// 单个文件上传成功
uploader.on('fileSuccess', function (rootFile, file, message) {
  console.log(rootFile, file, message)
})
// 根下的单个文件（文件夹）上传完成
uploader.on('fileComplete', function (rootFile) {
  console.log(rootFile)
})
// 某个文件上传失败了
uploader.on('fileError', function (rootFile, file, message) {
  console.log(rootFile, file, message)
})
```

## 服务端如何接受呢？

因为在前端做了一些分块啊等处理，所以也需要服务端做一些特殊处理，这个可以参考 `samples/Node.js/` 实现。

每一个上传块都会包含如下分块信息：

* `chunkNumber`: 当前块的次序，第一个块是 1，注意不是从 0 开始的。
* `totalChunks`: 文件被分成块的总数。
* `chunkSize`: 分块大小，根据 `totalSize` 和这个值你就可以计算出总共的块数。注意最后一块的大小可能会比这个要大。
* `currentChunkSize`: 当前块的大小，实际大小。
* `totalSize`: 文件总大小。
* `identifier`: 这个就是每个文件的唯一标示。
* `filename`: 文件名。
* `relativePath`: 文件夹上传的时候文件的相对路径属性。

一个分块可以被上传多次，当然这肯定不是标准行为，但是在实际上传过程中是可能发生这种事情的，这种重传也是本库的特性之一。

对于每个请求的响应码你都可以根据 `successStatuses`和`permanentErrors` 配置项是否是认为成功或失败的：

* `200`, `201`, `202`: 当前块上传成功，不需要重传。
* `404`, `415`. `500`, `501`: 当前块上传失败，会取消整个文件上传。
* _其他状态码_: 出错了，但是会自动重试上传。

## 处理 GET (或者 `test()` 请求)

如果说 `testChunks` 配置项是 `true` 的话，就可以实现秒传、或者刷新页面后、或者重启浏览器、甚至是跨浏览器还可以继续上传的效果，所有的上传必备的参数数据都会被一并发出：

* 如果请求返回了 `successStatuses` 配置的状态码，那么假定此块已经上传成功了。
* 如果返回的是 `permanentErrors` 中的状态码，那么就认为此块上传失败。
* 如果是其他状态吗，那么就认为服务端还没有这个块，需要按照标准模式上传。

所以有了以上的支持，服务端就可以根据预先发的这个请求来决定是否需要上传这个块内容，所以也就实现了秒传或者跨浏览器上传特性。

## API 文档

### Uploader

#### 配置

实例化的时候可以传入配置项：

```javascript
var r = new Uploader({ opt1: 'val', ...})
```

支持的配置项：

* `target` 目标上传 URL，可以是字符串也可以是函数，如果是函数的话，则会传入 `Uploader.File` 实例、当前块 `Uploader.Chunk` 以及是否是测试模式，默认值为 `'/'`。
* `singleFile` 单文件上传。覆盖式，如果选择了多个会把之前的取消掉。默认 `false`。
* `chunkSize` 分块时按照该值来分。最后一个上传块的大小是可能是大于等于1倍的这个值但是小于两倍的这个值大小，可见这个 [Issue #51](https://github.com/23/resumable.js/issues/51)，默认 `1*1024*1024`。
* `forceChunkSize` 是否强制所有的块都是小于等于 `chunkSize` 的值。默认是 `false`。
* `simultaneousUploads` 并发上传数，默认 `3`。
* `fileParameterName` 上传文件时文件的参数名，默认 `file`。
* `query` 其他额外的参数，这个可以是一个对象或者是一个函数，如果是函数的话，则会传入 `Uploader.File` 实例、当前块 `Uploader.Chunk` 以及是否是测试模式，默认为 `{}`。
* `headers` 额外的一些请求头，如果是函数的话，则会传入 `Uploader.File` 实例、当前块 `Uploader.Chunk` 以及是否是测试模式，默认 `{}`。
* `withCredentials` 标准的 CORS 请求是不会带上 cookie 的，如果想要带的话需要设置 `withCredentials` 为 `true`，默认 `false`。
* `method` 当上传的时候所使用的是方式，可选 `multipart`、`octet`，默认 `multipart`，参考 [multipart vs octet](https://stackoverflow.com/questions/29347234/multipart-form-data-vs-application-octet-stream)。
* `testMethod` 测试的时候使用的 HTTP 方法，可以是字符串或者函数，如果是函数的话，则会传入 `Uploader.File` 实例、当前块 `Uploader.Chunk`，默认 `GET`。
* `uploadMethod` 真正上传的时候使用的 HTTP 方法，可以是字符串或者函数，如果是函数的话，则会传入 `Uploader.File` 实例、当前块 `Uploader.Chunk`，默认 `POST`。
* `allowDuplicateUploads ` 如果说一个文件以及上传过了是否还允许再次上传。默认的话如果已经上传了，除非你移除了否则是不会再次重新上传的，所以也就是默认值为 `false`。
* `prioritizeFirstAndLastChunk` 对于文件而言是否高优先级发送第一个和最后一个块。一般用来发送到服务端，然后判断是否是合法文件；例如图片或者视频的 meta 数据一般放在文件第一部分，这样可以根据第一个块就能知道是否支持；默认 `false`。
* `testChunks` 是否测试每个块是否在服务端已经上传了，主要用来实现秒传、跨浏览器上传等，默认 `true`。
* `preprocess` 可选的函数，每个块在测试以及上传前会被调用，参数就是当前上传块实例 `Uploader.Chunk`，注意在这个函数中你需要调用当前上传块实例的 `preprocessFinished` 方法，默认 `null`。
* `initFileFn` 可选函数用于初始化文件对象，传入的参数就是 `Uploader.File` 实例。
* `readFileFn` 可选的函数用于原始文件的读取操作，传入的参数就是 `Uploader.File` 实例、文件类型、开始字节位置 startByte，结束字节位置 endByte、以及当前块 `Uploader.Chunk` 实例。并且当完成后应该调用当前块实例的`readFinished` 方法，且带参数-已读取的 bytes。
* `checkChunkUploadedByResponse` 可选的函数用于根据 XHR 响应内容检测每个块是否上传成功了，传入的参数是：`Uploader.Chunk` 实例以及请求响应信息。这样就没必要上传（测试）所有的块了，具体细节原因参考 [Issue #1](https://github.com/simple-uploader/Uploader/issues/1)，[使用示例](https://github.com/simple-uploader/Uploader/blob/develop/samples/Node.js/public/app.js#L15).
* `generateUniqueIdentifier` 可覆盖默认的生成文件唯一标示的函数，默认 `null`。
* `maxChunkRetries` 最大自动失败重试上传次数，值可以是任意正整数，如果是 `undefined` 则代表无限次，默认 `0`。
* `chunkRetryInterval` 重试间隔，值可以是任意正整数，如果是 `null` 则代表立即重试，默认 `null`。
* `progressCallbacksInterval` 进度回调间隔，默认是 `500`。
* `speedSmoothingFactor` 主要用于计算平均速度，值就是从 0 到 1，如果是 1 那么上传的平均速度就等于当前上传速度，如果说长时间上传的话，建议设置为 `0.02`，这样剩余时间预估会更精确，这个参数是需要和 `progressCallbacksInterval` 一起调整的，默认是 `0.1`。
* `successStatuses` 认为响应式成功的响应码，默认 `[200, 201, 
202]`。
* `permanentErrors` 认为是出错的响应码，默认 `[404, 415, 500, 501]`。
* `initialPaused` 初始文件 paused 状态，默认 `false`。
* `processResponse` 处理请求结果，默认 `function (response, cb) { cb(null, response) }`。 0.5.2版本后，`processResponse` 会传入更多参数：(response, cb, Uploader.File, Uploader.Chunk)。
* `processParams` 处理请求参数，默认 `function (params) {return params}`，一般用于修改参数名字或者删除参数。0.5.2版本后，`processParams` 会有更多参数：(params, Uploader.File, Uploader.Chunk, isTest)。

#### 属性

* `.support` 当前浏览器是否支持 File API 来上传。
* `.supportDirectory` 当前浏览器是否支持文件夹上传。
* `.opts` 实例的配置项对象。
* `.files` 由 `Uploader.File` 文件对象组成的数组，纯文件列表。
* `.fileList` 由 `Uploader.File` 文件、文件夹对象组成的数组，文件和文件夹共存。

#### 方法

* `.assignBrowse(domNodes, isDirectory, singleFile, attributes)` 指定 DOM 元素可以选择上传。
  * `domNodes` DOM 元素
  * `isDirectory` 如果传入的是 `true` 则代表是要选择文件夹上传的，你可以通过判断 `supportDirectory` 来决定是否设置
  * `singleFile` 是否只能选择单个文件
  * `attributes` 传入的其他属性值，例如你可以传入 `accept` 属性的值为 `image/*`，这样就意味着点选的时候只能选择图片。全部属性列表：https://www.w3.org/wiki/HTML/Elements/input/file

  Note: 避免使用 `a` 或者 `button` 标签作为选择文件按钮。
* `.assignDrop(domNodes)` 指定 DOM 元素作为拖拽上传目标。
* `.unAssignDrop(domNodes)` 取消指定的 DOM 元素作为拖拽上传目标。
* `.on(event, callback)` 监听事件。
* `.off([event, [callback]])`:
  * `.off(event)` 移除指定事件的所有事件回调
  * `.off(event, callback)` 移除指定事件的指定回调。`callback` 是一个函数
* `.upload()` 开始或者继续上传。
* `.pause()` 暂停上传。
* `.resume()` 继续上传。
* `.cancel()` 取消所有上传文件，文件会被移除掉。
* `.progress()` 返回一个0-1的浮点数，当前上传进度。
* `.isUploading()` 返回一个布尔值标示是否还有文件正在上传中。
* `.addFile(file)` 添加一个原生的文件对象到上传列表中。
* `.removeFile(file)` 从上传列表中移除一个指定的 `Uploader.File` 实例对象。
* `.getFromUniqueIdentifier(uniqueIdentifier)` 根据唯一标识找到 `Uploader.File` 实例。
* `.getSize()` 上传文件的总大小。
* `.sizeUploaded()` 所有已经成功上传文件大小。
* `.timeRemaining()` 剩余时间，单位秒；这个是基于平均上传速度计算出来的，如果说上传速度为 0，那么这个值就是 `Number.POSITIVE_INFINITY`。

#### 事件

* `.change(event)` input 的 change 事件。
* `.dragover(event)` 拖拽区域的 dragover 事件。
* `.dragenter(event)` 拖拽区域的 dragenter 事件。
* `.dragleave(event)` 拖拽区域的 dragleave 事件。
* `.fileSuccess(rootFile, file, message, chunk)` 一个文件上传成功事件，第一个参数 `rootFile` 就是成功上传的文件所属的根 `Uploader.File` 对象，它应该包含或者等于成功上传文件；第二个参数 `file` 就是当前成功的 `Uploader.File` 对象本身；第三个参数就是 `message` 就是服务端响应内容，永远都是字符串；第四个参数 `chunk` 就是 `Uploader.Chunk` 实例，它就是该文件的最后一个块实例，如果你想得到请求响应码的话，`chunk.xhr.status` 就是。
* `.fileComplete(rootFile)` 一个根文件（文件夹）成功上传完成。
* `.fileProgress(rootFile, file, chunk)` 一个文件在上传中。
* `.fileAdded(file, event)` 这个事件一般用作文件校验，如果说返回了 `false`，那么这个文件就会被忽略，不会添加到文件上传列表中。
* `.filesAdded(files, fileList, event)` 和 fileAdded 一样，但是一般用作多个文件的校验。
* `.filesSubmitted(files, fileList, event)` 和 filesAdded 类似，但是是文件已经加入到上传列表中，一般用来开始整个的上传。
* `.fileRemoved(file)` 一个文件（文件夹）被移除。
* `.fileRetry(rootFile, file, chunk)` 文件重试上传事件。
* `.fileError(rootFile, file, message, chunk)` 上传过程中出错了。
* `.uploadStart()` 已经开始上传了。
* `.complete()` 上传完毕。
* `.catchAll(event, ...)` 所有的事件。

### Uploader.File

#### 属性

* `.uploader` 对 `Uploader` 实例的引用。
* `.name` 文件（夹）名字。
* `.averageSpeed` 平均速度，单位字节每秒。
* `.currentSpeed` 当前速度，单位字节每秒。
* `.paused` 文件是否是暂停的。
* `.error` 文件上传是否出错了。
* `.isFolder` 是否是文件夹。

如果不是文件夹的话，那么还会有如下属性：

* `.file` 原生 HTML5 `File` 对象。
* `.relativePath` 文件相对路径。
* `.size` 文件大小，单位字节。
* `.uniqueIdentifier` 文件唯一标示。
* `.chunks` 由 `Uploader.Chunk` 实例组成数组，分成的块集合，一般场景下并不需要关心它。

#### 方法

* `.getRoot()` 得到当前文件所属的根文件，这个根文件就是包含在 `uploader.fileList` 中的.
* `.progress()` 返回一个 0 到 1 的数字，代表当前上传进度。
* `.pause()` 暂停上窜文件。
* `.resume()` 继续上传文件。
* `.cancel()` 取消上传且从文件列表中移除。
* `.retry()` 重新上传文件。
* `.bootstrap()` 重新初始化 `Uploader.File` 对象的状态，包括重新分块，重新创建新的 XMLHttpRequest 实例。
* `.isUploading()` 文件是否扔在上传中。
* `.isComplete()` 文件是否已经上传完成。
* `.sizeUploaded()` 已经上传大小。
* `.timeRemaining()` 剩余时间，基于平均速度的，如果说平均速度为 0，那么值就是 `Number.POSITIVE_INFINITY`。
* `.getExtension()` 得到小写的后缀。
* `.getType()` 得到文件类型。

## 源

simple-uploader.js 是 FORK 的 https://github.com/flowjs/flow.js 的，参考了 https://github.com/23/resumable.js。
