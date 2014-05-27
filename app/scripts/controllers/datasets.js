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

    function _uploadFile1(file, callback) {
      function Uploader() {
        var timeToGo = file.size / (10 * 1024* 1024);
        console.log('will use:', timeToGo);
        var progress = (1 / timeToGo) * 100;
        this.stopFlag = false;
        this.count = function() {
          var self = this;
          setTimeout(function() {
            timeToGo -= 1;
            if (self.stopFlag) {
              callback('cancelled');
              return;
            }
            if (timeToGo > 0) {
              callback('progress', progress);
              self.count();
            } else {
              callback('done');
            }
          }, 1000);
        };
      }
      var u = new Uploader();
      u.count();
    }

    function _uploadFile(file, callback) {
      var url = '';
      var method = '';
      var params = {};
      console.log(file.type);
      params.headers = {
        //'X-Snarl-Token': '8ec5d4ea-0bf4-4168-89ef-58a3063e59ba',
        'Content-Type': file.type,
        'Accept': 'application/json'
      };
      switch(file.type) {
        case 'application/json':
          params.data = JSON.parse(file.readAsText());
          params.url = Config.endpoint + 'datasets/' + params.data.uuid;
          params.method = 'POST';
          break;
        case 'application/gzip':
          params.url = Config.endpoint + 'datasets/' + 'd2ba0f30-bbe8-11e2-a9a2-6bc116856d85' + '/dataset.gz';
          params.headers['Content-Type'] = 'application/x-gzip';
          params.method = 'PUT';
          params.file = file;
          break;
      };

      console.log('will execute upload with: ', params);
      return;

      return $upload.upload(params)
        .progress(function(evt) {
          callback('progress', parseInt(100.0 * evt.loaded / evt.total));
        })
        .success(function(data, status, headers, config) {
          callback('done');
        })
        .error(function(err) {
          callback('error');
        });
    }

    var uploader = $scope.uploader = {
      queue: [],
      isHTML5: true,
      isUploading: false,
      continueFlag: true,
      getNotUploadedItems: function() {
          var result = [];
          this.queue.forEach(function(item) {
              if (!item.isUploaded) {
                  result.push(item);
              }
          });
          return result;
      },
      upload: function(item) {
        var self = this;
        this.isUploading = true;
        item.uploader = _uploadFile(item.file, function(status, progress) {
          switch (status) {
            case 'done':
              item.isSuccess = true;
              item.inUploading = false;
              item.progress = 100;
              if (self.continueFlag) {
                self.startUpload();
              }
              break;
            case 'cancelled':
              item.isCancel = true;
              item.inUploading = false;
              break;
            case 'progress':
              item.progress += progress;
              if (item.progress > 100) {
                item.progress = 100;
              }
              item.inUploading = true;
              break;
          }
        });
      },
      startUpload: function() {
        var todo = null;
        for (var i=0; i<this.queue.length; i++) {
          if (!this.queue[i].isSuccess) {
            todo = this.queue[i];
            break;
          }
        }
        if (todo) {
          this.upload(todo);
        }
      },
      cancel: function(item) {
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
      },
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
      uploader.queue.push({
        file: files[0],
        isSuccess: false,
        isCancel: false,
        isError: false,
        inUploading: false,
        progress: 0,
        uploader: null
      })
      return;
    };

  });
