'use strict';

angular.module('fifoApp')
  .controller('DatasetsCtrl', function ($scope, wiggle, datasetsat, status, $upload) {

    $scope.datasetsat = {};
    $scope.endpoint = Config.datasets;

    var _uuid = function() {
        function _p8(s) {
            var p = (Math.random().toString(16)+"000000000").substr(2,8);
            return s ? "-" + p.substr(0,4) + "-" + p.substr(4,4) : p ;
        }
        return _p8() + _p8(true) + _p8(true) + _p8();
    };

    $scope.import = function(uuid) {
        var url = $scope.url
        if (uuid)
            url = datasetsat.endpoint + '/datasets/' + uuid;

        wiggle.datasets.import({}, {url: url},
           function success(r) {
                howl.join(uuid);
                $scope.datasets[uuid] = r;
                status.info('Importing ' + r.name + ' ' + r.version)
                if ($scope.datasetsat[uuid])
                    $scope.datasetsat[uuid].imported = true;
           },
           function error(e) {
                status.error('Could not import dataset')
                console.error(e)
           });
    };

    $scope.delete = function(dataset) {

        $scope.modal = {
            btnClass: 'btn-danger',
            confirm: 'Delete',
            title: 'Confirm Dataset Deletion',
            body: '<p><font color="red">Warning!</font> you are about to delete dataset <b>' +
                dataset.name + " v" + dataset.version + " (" + dataset.dataset + ")</b> Are you 100% sure you really want to do this?</p>",
                ok: function() {
                    wiggle.datasets.delete({id: dataset.dataset},
                        function success() {
                            delete $scope.datasets[dataset.dataset]
                            status.success('Dataset deleted.')

                            /* Search the remote dataset element, and set it as not imported. */
                            var remoteDs = $scope.datasetsat[dataset.dataset]
                            if (remoteDs)
                                remoteDs.imported = false;
                        },
                        function error(e) {
                            status.error('Could not delete Dataset')
                        }
                    )
                }
        }
    }

    $scope.$on('progress', function(e, msg) {
        $scope.$apply(function() {
            var imp = msg.message.data.imported
            $scope.datasets[msg.channel].imported = imp

            //Howl currently does not send the status, so set it here.
            if (imp === 1)
                $scope.datasets[msg.channel].status = 'imported'
            else
                $scope.datasets[msg.channel].status = 'importing'

        });
    })

    $scope.show = function() {

        wiggle.datasets.query(function(datasets) {
            $scope.datasets = {}
            datasets.forEach(function(res) {

                var id = res.dataset;
                howl.join(id)

                //Datasets imported with previouse fifo (i.e. prev than 20131212T153143Z) does not has the status field, artificially add one.
                if (!res.status) {
                    if (res.imported === 1)
                        res.status = 'imported'
                    else
                        res.status = 'pending'
                }
                $scope.datasets[id] = res
            })
        })

        if (!Config.datasets)
            return status.error('Make sure your config has an URL for the remote datasets')

        /* Get the available datasets */
        $scope.loadingRemoteDatasets = true
        datasetsat.datasets.query(function ok(data) {
            data.forEach(function(e) {
                var localOne = $scope.datasets[e.uuid];
                e.imported = localOne && localOne.imported && localOne.imported > 0 || false
                $scope.datasetsat[e.uuid] = e
            })
            $scope.loadingRemoteDatasets = false
        }, function nk(res) {
            status.error('Could not load remote datasets ' + res.status)
            console.error(res)
            $scope.loadingRemoteDatasets = false
        });

    }
    $scope.show();

    /* upload functions */

    function _getFileExt(filename) {
      var a = filename.split(".");
      if( a.length === 1 || ( a[0] === "" && a.length === 2 ) ) {
        return "";
      }
      return a.pop();
    }

    function _readFileAsText(fileObj, callback) {
      var r = new FileReader();
      r.onload = function(e) {
        var contents = e.target.result;
        callback(contents);
      }
      r.readAsText(fileObj);
    }

    function _uploadFile(item, uuidfile, callback) {
      _readFileAsText(uuidfile, function(contents) {
        var j = JSON.parse(contents);
        if (j && j.uuid) {
          switch(item.filetype) {
            case 'application/json':
              _uploadFile_manifest(item, j, callback);
              break;
            case 'application/x-gzip':
              _uploadFile_gz(item, j, callback);
              break;
          }
        } else {
          status.error('Can not read uuid from:' + uuidfile.name);
          callback('error', 'Can not read uuid from: ' + uuidfile.name);
        }
      });
    }

    function _uploadFile_manifest(item, manifest, callback) {
      var url = '';
      var method = '';
      var params = {};
      params.headers = { 'Accept': 'application/json' };
      params.data = manifest;
      params.url = Config.endpoint + 'datasets/' + manifest.uuid + '/';
      params.headers['Content-Type'] = 'application/json;charset=UTF-8';
      params.method = 'POST';
      $.getJSON(params.url, function() {})
       .done(function() {
         // already have this manifest, so just mark it succeeded
         callback('done');
       })
       .fail(function() {
         // only upload when there isn't
         item.uploader = $upload.http(params)
           .progress(function(evt) {
             callback('progress', parseInt(100.0 * evt.loaded / evt.total));
           })
           .success(function() {
             callback('done');
           })
           .error(function(err) {
             callback('error');
           });
       });
    }

    function _uploadFile_gz(item, manifest, callback) {
      var url = '';
      var method = '';
      var params = {};
      params.headers = { 'Accept': 'application/json' };
      params.url = Config.endpoint + 'datasets/' + manifest.uuid + '/dataset.gz';
      params.headers['Content-Type'] = 'application/x-gzip';
      params.method = 'PUT';
      var fileReader = new FileReader();
      fileReader.readAsArrayBuffer(item.file);
      fileReader.onload = function(e) {
        params.data = e.target.result;
        item.uploader = $upload.http(params)
          .progress(function(evt) {
            callback('progress', parseInt(100.0 * evt.loaded / evt.total));
          })
          .success(function() {
            callback('done');
          })
          .error(function(err) {
            callback('error');
          });
      };
    }

    function FileItem(overlay) {
      this.filetype = '';
      this.file = null;
      this.inUploading = false;
      this.isSuccess =  false;
      this.isCancel = false;
      this.isError = false;
      this.progress = 0;
      this.errorMsg = '';
      this.uploader = null;
      this.roundSkip = false;
      var self = this;
      Object.keys(overlay).forEach(function(key) {
        self[key] = overlay[key];
      });
    }

    FileItem.prototype.reset = function() {
      this.inUploading = false;
      this.isSuccess =  false;
      this.isCancel = false;
      this.isError = false;
      this.progress = 0;
      this.errorMsg = '';
    };

    FileItem.prototype.setError = function(msg) {
      this.isError = true;
      this.inUploading = false;
      this.errorMsg = msg || '';
    };

    FileItem.prototype.setSuccess = function() {
      this.isSuccess = true;
      this.inUploading = false;
      this.progress = 100;
    };

    FileItem.prototype.setCancel = function() {
      this.isCancel = true;
      this.inUploading = false;
    };

    var uploader = $scope.uploader = {
      queue: [],
      isHTML5: true,
      isUploading: false,
      continueFlag: true,

      canStart: function() {
        if (this.isUploading) {
          return false;
        }
        var foundTodo = false;
        for (var i=0; i<this.queue.length; i++) {
          if (!this.queue[i].isSuccess) {
            foundTodo = true;
            break;
          }
        }
        return foundTodo;
      },

      upload: function(item) {
        var self = this;
        item.reset();
        var uuidfile = item.file;
        if (item.file.type === 'application/gzip') { // this is dataset.gz case
          // try to find the corresponding .dsmanifest file
          var nameToFind = item.file.name.slice(0, -3 /* .gz */) + '.dsmanifest';
          var found = null;
          for (var i=0; i<this.queue.length; i++) {
            if (this.queue[i].file.name === nameToFind) {
              found = this.queue[i];
              break;
            }
          }
          if (found) {
            // recur to upload .dsmanifest before .gz
            if (!found.isSuccess && !found.roundSkip) {
              this.upload(found);
            }
            uuidfile = found.file;
          } else {
            item.setError('Misssing manifest file!');
            status.error(item.errorMsg + '[' + item.file.name + ']');
            return;
          }
        }

        _uploadFile(item, uuidfile, function(status, data) {
          switch (status) {
            case 'done':
              item.setSuccess();
              if (self.continueFlag) {
                self.startUpload();
              }
              break;
            case 'cancelled':
              item.setCancel();
              if (self.continueFlag) {
                self.startUpload();
              }
              break;
            case 'progress':
              item.progress += data;
              if (item.progress > 100) {
                item.progress = 100;
              }
              item.inUploading = true;
              break;
            case 'error':
              item.setError(data);
              item.roundSkip = true;
              if (self.continueFlag) {
                self.startUpload();
              }
              break;
          }
        });
      },

      newRoundUpload: function() {
        this.queue.forEach(function(item) {
          item.roundSkip = false;
        });
        this.startUpload();
      },

      startUpload: function() {
        var todo = null;
        for (var i=0; i<this.queue.length; i++) {
          if (!this.queue[i].isSuccess && !this.queue[i].roundSkip) {
            todo = this.queue[i];
            break;
          }
        }
        if (todo) {
          this.upload(todo);
        } else {
          this.isUploading = false;
        }
      },

      /*
      cancel: function(item) {
        console.log('will cancel: ', item);
        if (item.uploader) {
          item.uploader.stopFlag = true;
        }
      },

      cancelAll: function() {
        var self = this;
        this.continueFlag = false;
        this.queue.forEach(function(item) {
          self.cancel(item);
        });
        this.isUploading = false;
      },
      */

      remove: function(item) {
        var i = this.queue.indexOf(item);
        if (i >= 0 && i <= this.queue.length) {
          if (item.inUploading) {
            this.cancel(item);
          }
          this.queue.splice(i, 1);
        }
      },

      removeAll: function() {
        var self = this;
        this.queue.forEach(function(item) {
          self.remove(item);
        });
      }
    };

    $scope.onFileSelect = function(files) {
      var filetype = '';
      var file = files[0];
      var ext = _getFileExt(file.name);
      switch(ext) {
        case 'gz':
          filetype = 'application/x-gzip';
          break;
        case 'dsmanifest':
          filetype = 'application/json';
          break;
        default:
          status.error('File must be .gz or .dsmanifest file.');
          return;
      }
      // LI, Yu: Currently as I have tested, 250MB is safe to upload in browser.
      if (file.size > 250*1024*1024) {
        status.error('File ' + file.name + ' is too big (>250MB) to be uploaded in browser. Please try to upload it by client API (such as PyFi).');
        return;
      }
      uploader.queue.push(new FileItem({
        filetype: filetype,
        file: file
      }));
      return;
    };

  });
