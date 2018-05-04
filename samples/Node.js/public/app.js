(function () {
  var r = new Uploader({
    target: '/upload',
    chunkSize: 1024 * 1024,
    testChunks: true,
    checkChunkUploadedByResponse: function (chunk, message) {
      var objMessage = {}
      try {
        objMessage = JSON.parse(message)
      } catch (e) {}
      // fake response
      // objMessage.uploaded_chunks = [2, 3, 4, 5, 6, 8, 10, 11, 12, 13, 17, 20, 21]
      // check the chunk is uploaded
      return (objMessage.uploaded_chunks || []).indexOf(chunk.offset + 1) >= 0
    }
  });
  // simple-uploader.js isn't supported, fall back on a different method
  if (!r.support) {
    $('.uploader-error').show();
    return ;
  }
  // Show a place for dropping/selecting files
  $('.uploader-drop').show();
  r.assignDrop($('.uploader-drop')[0]);
  r.assignBrowse($('.uploader-browse')[0]);
  r.assignBrowse($('.uploader-browse-folder')[0], true);
  r.assignBrowse($('.uploader-browse-image')[0], false, false, {accept: 'image/*'});

  // Handle file add event
  r.on('filesAdded', function (files, fileList) {
    // Show progress bar
    $('.uploader-progress, .uploader-list').show();
    fileList.forEach(function (file) {
      var $self = file.$el = $(
        '<li class="uploader-file">' +
          'Uploading <span class="uploader-file-name"></span> ' +
          '<span class="uploader-file-size"></span> ' +
          '<span class="uploader-file-progress"></span> ' +
          '<span class="uploader-file-pause">' +
            ' <img src="pause.png" title="Pause upload">' +
          '</span>' +
          '<span class="uploader-file-resume">' +
            ' <img src="resume.png" title="Resume upload">' +
          '</span>' +
          '<span class="uploader-file-cancel">' +
            ' <img src="cancel.png" title="Cancel upload">' +
          '</span>' +
        '</li>'
      );
      $self.find('.uploader-file-name').text(file.name);
      $self.find('.uploader-file-size').text(file.getFormatSize());
      $self.find('.uploader-file-pause').on('click', function () {
        file.pause();
        $self.find('.uploader-file-pause').hide();
        $self.find('.uploader-file-resume').show();
      });
      $self.find('.uploader-file-resume').on('click', function () {
        file.resume();
        $self.find('.uploader-file-pause').show();
        $self.find('.uploader-file-resume').hide();
      });
      $self.find('.uploader-file-cancel').on('click', function () {
        file.cancel();
        $self.remove();
      });
      $('.uploader-list').append($self);
    });
  });
  r.on('filesSubmitted', function (files, fileList) {
    window.r.upload();
  });
  r.on('complete', function () {
    // Hide pause/resume when the upload has completed
    $('.uploader-progress .progress-resume-link, .uploader-progress .progress-pause-link').hide();
  });
  r.on('fileComplete', function (rooFile) {
    var $self = rooFile.$el
    // Reflect that the file upload has completed
    $self.find('.uploader-file-progress').text('(completed)');
    $self.find('.uploader-file-pause, .uploader-file-resume').remove();
  });
  r.on('fileError', function (rootFile, file, message) {
    rootFile.$el.find('.uploader-file-progress').html('(file could not be uploaded: ' + message + ')')
  });
  r.on('fileProgress', function (rootFile, file) {
    // Handle progress for both the file and the overall upload
    rootFile.$el.find('.uploader-file-progress')
      .html(Math.floor(rootFile.progress() * 100) + '% '
        + Uploader.utils.formatSize(rootFile.averageSpeed) + '/s '
        + secondsToStr(rootFile.timeRemaining()) + ' remaining') ;
    $('.progress-bar').css({width:Math.floor(r.progress()*100) + '%'});
  });
  r.on('uploadStart', function () {
    // Show pause, hide resume
    $('.uploader-progress .progress-resume-link').hide();
    $('.uploader-progress .progress-pause-link').show();
  });
  r.on('catchAll', function () {
    console.log.apply(console, arguments);
  });

  window.r = {
    pause: function () {
      r.pause();
      // Show resume, hide pause
      $('.uploader-file-resume').show();
      $('.uploader-file-pause').hide();
      $('.uploader-progress .progress-resume-link').show();
      $('.uploader-progress .progress-pause-link').hide();
    },
    cancel: function () {
      r.cancel();
      $('.uploader-file').remove();
    },
    upload: function () {
      $('.uploader-file-pause').show();
      $('.uploader-file-resume').hide();
      r.resume();
    },
    uploader: r
  };
})();

function secondsToStr (temp) {
  function numberEnding (number) {
    return (number > 1) ? 's' : '';
  }
  var years = Math.floor(temp / 31536000);
  if (years) {
    return years + ' year' + numberEnding(years);
  }
  var days = Math.floor((temp %= 31536000) / 86400);
  if (days) {
    return days + ' day' + numberEnding(days);
  }
  var hours = Math.floor((temp %= 86400) / 3600);
  if (hours) {
    return hours + ' hour' + numberEnding(hours);
  }
  var minutes = Math.floor((temp %= 3600) / 60);
  if (minutes) {
    return minutes + ' minute' + numberEnding(minutes);
  }
  var seconds = temp % 60;
  return seconds + ' second' + numberEnding(seconds);
}
