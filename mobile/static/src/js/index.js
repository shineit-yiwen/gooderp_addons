$(function(){
    // vue对象
    var vue = false,
        origin_data = {
            max_count: 0,
            search_word: '',
            display_search_results: true,
            search_cache: false,
            model: '',
            display_name: '',
            records: [],
            headers: {'left': '', 'center': '', 'right': ''},
            search_view: [],
            search_filter: [],
            order_name: '',
            order_direction: 'desc',
            loading: false,
        },
        vue_data = {};

    // 参考https://github.com/progrape/router，写一个简单的router
    function getHash(url) {
        return url.indexOf('#/') !== -1 ? url.substring(url.indexOf('#/') + 2) : '/';
    }

    function hashchange(url, stop_animation) {
        var hash = getHash(url),
            home = $('#home'),
            tree = $('#tree'),
            count = $('.gooderp_max_count');

        if (stop_animation) {
            if (hash === '/') {
                home.show();
                tree.hide();
            } else {
                tree.show();
                home.hide();
            }
        } else {
            if (hash === '/') {
                home.addClass('enter').removeClass('leave');
                tree.addClass('leave').removeClass('enter');
            } else {
                tree.addClass('enter').removeClass('leave');
                home.addClass('leave').removeClass('enter');
            }
        }

        if (hash !== '/') {
            init_tree_view(hash);
            count.show();
        } else {
            count.hide();
        }
    }

    window.addEventListener('hashchange', function(event){
        hashchange(event.newURL);
    });
    hashchange(location.hash, true);

    function refresh_vue_data(hash, display_name) {
        origin_data.records = [];
        origin_data.search_view = [];
        origin_data.search_filter = [];
        origin_data.headers = {'left': '', 'center': '', 'right': ''};

        for (var key in origin_data) {
            vue_data[key] = origin_data[key];
        }
        vue_data.model = hash;
        vue_data.display_name = display_name;
    }

    function init_tree_view(hash) {
        refresh_vue_data(hash, $('a[href="#/' + hash + '"]').data('display'));
        vue = vue || create_vue(vue_data);
        vue.sync_records();
    }

    var MAP_OPERATOR = {
        '>': '大于',
        '<': '小与',
        '>=': '大于等于',
        '<=': '小与等于',
        '=': '等于',
        '!=': '不等于',
    };

    function map_operator(operator) {
        operator = operator || '=';
        return MAP_OPERATOR[operator];
    }

    function sync_lists(name, options) {
        return $.when($.get('/mobile/get_lists', {
            name: name,
            options: JSON.stringify(options || {}),
            // options: {
            //     domain: domain,
            //     offset: offset,
            //     limit: limit,
            //     order: order,
            //     type: type || 'tree', // 获取数据来源是tree还是form
            //     record_id: record_id,
            // }
        }));
    }

    function sync_search_view(name) {
        return $.when($.get('/mobile/get_search_view', {
            name: name,
        }));
    }

    function create_vue(data) {
        var vue = new Vue({
            el: '#container',
            data: data,
            methods: {
                // 参考https://github.com/ElemeFE/vue-infinite-scroll来添加无限滑动
                scroll_container: function() {
                    var container = $('#container'),
                        scrollDistance = container.scrollTop() + container.height();

                    if (container.prop('scrollHeight') - scrollDistance < 10) {
                        vue.loadMore();
                    }
                },
                loadMore: function() {
                    var self = this;
                    if (self.records.length <= 0 || self.loading) return;
                    if (self.records.length >= self.max_count) return;

                    self.loading = true;

                    var progress = 0;
                    var $progress = $('.js_progress');

                    function next() {
                        $progress.css({width: progress + '%'});
                        progress = ++progress % 100;
                        if (self.loading) setTimeout(next, 30);
                        else $progress.css({width: 0});
                    }

                    next();

                    self.do_sync({
                        offset: this.records.length,
                    }, function(results) {
                        results = JSON.parse(results);
                        self.records = self.records.concat(results.values);
                        self.loading = false;
                    });
                },
                order_by: function(event, headers) {
                    if (this.order_name === headers.name) {
                        this.order_direction = this.order_direction === 'desc'? 'asc' : 'desc';
                    } else {
                        this.order_direction = 'desc';
                    }

                    this.order_name = headers.name;
                    this.do_sync();
                },
                focus_search: function() {
                    this.display_search_results = true;
                },
                blur_search: function() {
                    this.display_search_results = false;
                },
                enter_search: function() {
                    if (this.search_word) {
                        this.add_search(this.search_view[0]);
                    }
                },
                esc_search: function() {
                    if (!this.search_word) {
                        this.search_filter.pop();
                        this.do_sync(null, null, function() { alert('搜索错误'); });
                    }
                },
                cancel_search: function() {
                    this.search_filter = [];
                    this.search_word = '';

                    this.do_sync(null, null, function() { alert('搜索错误'); });
                },
                cancel_filter: function(index) {
                    this.search_filter.splice(index, 1);
                    this.do_sync(null, null, function() { alert('搜索错误'); });
                },
                add_search: function(view) {
                    this.search_filter.push({
                        string: view.string,
                        word: this.search_word,
                        name: view.name,
                        operator: view.operator,
                    });

                    this.search_word = '';
                    this.do_sync(null, null, function() { alert('搜索错误'); });
                },
                do_sync: function(options, success, error) {
                    options = options || {};
                    options.domain = options.domain || this.search_filter;
                    options.order = options.order || [this.order_name, this.order_direction].join(' ');

                    return this.sync_records(options, success, error);
                },
                map_operator: map_operator,
                choose_operator: function(value) {
                    $('#dialog1').show().on('click', '.weui_cell', function(event) {
                        value.operator = $(this).data('operator');
                        $(this).off('click');
                        $('#dialog1').hide();
                        $('.weui_input').focus();
                    }).one('click', '.weui_btn_dialog, .weui_mask', function(event) {
                        $('#dialog1').hide();
                        $('.weui_input').focus();
                    });
                },
                sync_records: function(options, success, error) {
                    var self = this;
                    success = success || function(results) {
                        results = JSON.parse(results);
                        self.records = results.values;
                        self.headers = results.headers;
                        self.max_count = results.max_count;
                        self.loading = false;
                    };

                    return sync_lists(this.model, options).then(success, error);
                },
                compute_class: function(header) {
                    return header.class || '';
                },
                compute_widget: function(header, field) {
                    return field;
                },
            },
        });

        vue.$watch('search_word', function(word) {
            if (!vue.search_cache) {
                sync_search_view(vue.model).then(function(results) {
                    vue.search_view = JSON.parse(results);
                });
                vue.search_cache = true;
            }
        });

        return vue;
    }
});
