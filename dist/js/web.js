$(window).load(function () {

    $('#viewport').css('display', 'block');

    // Events subscriptions
    $(window).resize(function (e) {
        resize();
    });

    renderLabels();
    loadData();
    setupSlider();
});

var finishLoading = function () {
    // Animate loader off screen
    $('#appLoading').fadeOut('slow');

    // Show table for first dataset, to have something XXX do better
    $('#panel-demandas').find('.details').click();
};

var tableColumn = function (label, format) {
    return {label: label, format: format}
};

var commonColumns = [
    tableColumn("Fecha Inicio", function (d) {
        return d.FECHA_INICIO;
    }), tableColumn("N. Autos", function (d) {
        return d.NUMERO_AUTOS;
    }), tableColumn("Importe reclamado", function (d) {
        return formatNumber(d.IMPORTE_RECLA_UNIQ);
    })];
var errorTxt = "Error", okTxt = "OK";

var control = {
    ndx: {}, allGroup: {}, filters: {},
    scrolling: false, enableScrolling: false,
    maps: {
        baseTile: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png',
        defaultLat: 40.45,
        defaultLon: -3.65,
        defaultZoom: 6
    },
    slider: {
        min: 0, max: 1e6, stepNumber: 20
    },
    dataTable: {
        pagination: 12,
        anchor: '#details-table',
        offset: 0,
        currentDatasetName: undefined,
        firstColumn: [tableColumn("#ID", function (d) {
            return d.ID_PROCESO
        })],
        lastColumn: [tableColumn("Estado", function (d) {
            return (d.HAS_ERROR) ? errorTxt : okTxt;
        })],
        datasetColumns: {
            "adjudicaciones": commonColumns.concat([]),
            "demandas": [
                tableColumn("Admisión", function (d) {
                    return d.FEC_ADMISION;
                }), tableColumn("Presentación demanda", function (d) {
                    return d.FEC_PRESENTA_DEM;
                }), tableColumn("# Juzgado", function (d) {
                    return d.ID_JUZGADO;
                }), tableColumn("Costas", function (d) {
                    return d.COSTAS.replace(',', '.').toLocaleString() ;
                })
            ].concat(commonColumns),
            "requerimientos": commonColumns.concat([
                tableColumn("Certificación cargas", function (d) {
                    return d.FECHA_CARGAS_REG;
                }), tableColumn("Req. de pago", function (d) {
                    return d.FECHA_REQ_PAGO;
                }), tableColumn("Resultado", function (d) {
                    return d.RES_REQUER;
                }), tableColumn("Hay oposición?", function (d) {
                    if (d.OPOSICION == "S") return 'Si';
                    else if (d.OPOSICION == "N") return 'No';
                    else return "?";
                }), tableColumn("¿SOLICITADOS OFICIOS CARGAS PREVIAS?", function (d) {
                    return d.OFICIOS;
                })
            ]),
            "subastas": commonColumns.concat([
                tableColumn("Resultado", function (d) {
                    return d.RES_SUBASTA;
                }), tableColumn("Celebración subasta", function (d) {
                    return d.FEC_CELEB_SUB;
                }), tableColumn("Importe Adjudicación", function (d) {
                    return d.AA_SUBASTA_IMP_ADJ;
                })
            ])
        }
    },
    data: {},
    dimensions: {},
    chartInfo: [],
    limits: {
        importe: -1
    },
    staticTotals: {}
};

var renderLabels = function () {
    $('.label_importe_total').text("Reclamado(€)");
    $('.label_total_items').text("Registros");

    $('#panel-demandas').find('.sub-header').text("Demandas");
    $('#panel-requerimientos').find('.sub-header').text("Requerimientos");
    $('#panel-subastas').find('.sub-header').text("Subasta");
    $('#panel-adjudicaciones').find('.sub-header').text("Adjudicaciones");
};

var setupSlider = function () {

    $("input#slider").slider(
        {
            min: control.slider.min, max: control.slider.max,
            value: control.slider.min,
            ticks_snap_bounds: 20,
            ticks: [control.slider.min, control.slider.max],
            tooltip: 'always',
            scale: 'linear', //'logarithmic',
            tooltip_position: 'bottom',
            step: Math.floor(control.slider.max / control.slider.stepNumber),
            formatter: function (value) {
                if (value > control.slider.min)
                    return 'Al menos ' + formatNumber(value) + '€';
                else
                    return 'Todos';
            }
        })
        .on('slideStop', function (slideEvt) {
            onFilter("importe", slideEvt.value);
        })
    ;
    $(".slider").attr("style", "margin-left: 10px; width: 88%;");
};

var formatNumber = function (number) {
    if (number > 0) {
        return number.toLocaleString().replace(/,/g, 'PLACEHOLDER')
            .replace(/\./g, ',')
            .replace(/PLACEHOLDER/g, '.')
            ;// + " €";
    } else
        return "0";
};

var onFilter = function (field, newLimit) {

    control.limits[field] = parseInt(newLimit);
    $.each(control.dataTable.datasetColumns, function (type, columns) {
        var filteredDataset = getFilteredDataset(control.data[type]);
        drawPieChart(filteredDataset, type);

        if (control.dataTable.currentDatasetName == type) {
            drawDataTable(filteredDataset, type);
        }
    });
};

var drawData = function (data, type) {
    var filteredDataset = getFilteredDataset(data);
    drawPieChart(filteredDataset, type);

    $('#panel-' + type).find('.details').on('click', function () {
        var elem = $(this).parent() ;
        
        $('.selected').removeClass("selected");
        elem.addClass("selected");

        if (control.dataTable.currentDatasetName != type) {
            control.dataTable.current = undefined;
            control.dataTable.currentDatasetName = type;
            showDataTable();
            drawDataTable(filteredDataset, type);
        }
    });
};

var getFilteredDataset = function (rawData) {
    var data = rawData;
    if (control.limits.importe >= 0) {
        data = rawData.filter(function (d) {
            return (d.IMPORTE_RECLA_UNIQ >= control.limits.importe);
        });
    }
    return data;
};

var drawPieChart = function (data, type) {

    if (!control.ndx.hasOwnProperty(type)) {
        control.ndx[type] = updatingCrossfilter(data, []); // TODO: Add dimensions
        var errorDimension = control.ndx[type].dimension(function (v) {
            return v.HAS_ERROR == true;
        });
        var errorGroup = errorDimension.group();

        var colorScale = d3.scale.ordinal()
            .domain([false, true])
            .range(['#1eb958', '#bf0223'])
            ;

        control.allGroup[type] = control.ndx[type].groupAll().reduce(
            function (p, v) {
                p.items += 1;
                p.importe += v.IMPORTE_RECLA_UNIQ;
                return p;
            },
            function (p, v) {
                p.items -= 1;
                p.importe -= v.IMPORTE_RECLA_UNIQ;
                return p;
            },
            function () {
                return {items: 0, importe: 0};
            }
        );

        var pieChart = dc.pieChart("#panel-" + type + " .pie-chart")
            .dimension(errorDimension)
            .group(errorGroup)
            .title(function (d) {
            }, false)
            .colors(function (HAS_ERROR) {
                return colorScale(HAS_ERROR == true);
            })
            .on('pretransition', function (chart) {
                chart.selectAll('text.pie-slice').text(function (d) {
                    var text = (!d.data.key) ? okTxt : errorTxt;
                    return text + ' ' + dc.utils.printSingleValue((d.endAngle - d.startAngle) / (2 * Math.PI) * 100) + '%';
                })
            })
            .on("filtered", function (d) {
                updateCounters(type);
            })
            .render();
        control.chartInfo.push(pieChart);

    } else {
        control.ndx[type].replace(data);
    }

    updateCounters(type);
};

var updateCounters = function (type) {
    var summary = $('#panel-' + type).find('table.summary');

    summary.find('.total_items').text(formatNumber(control.allGroup[type].value().items));
    summary.find('.total_importe').text(formatNumber(control.allGroup[type].value().importe));
    dc.redrawAll();
};

var showDataTable = function () {
    var table = $(control.dataTable.anchor);
    table.fadeIn("slow");
    scrollTo(table);
};

var drawDataTable = function (data, type) {

    if (!control.dataTable.current) {
        var columns = control.dataTable.firstColumn
            .concat(control.dataTable.datasetColumns[control.dataTable.currentDatasetName])
            .concat(control.dataTable.lastColumn)
            ;

        control.dataTable.current = dc.dataTable('#dc-data-table')
            .dimension(control.ndx[type].dimension(function (x) {
                return x.HAS_ERROR == true;
            }))
            .group(function (d) {
                return ''; // cheap trick: group by nothing so the 'striped' effect kicks-in
            })
            .showGroups(false) // removes the grouping line at the top
            .size(Infinity) // So we can use pagination
            .columns(columns)
            .sortBy(function (d) {
                return d.FECHA_INICIO;
            });
    }
    control.dataTable.size = control.allGroup[type].value().items;
    control.dataTable.offset = 0; // reset
    update();
    //dc.redrawAll();
};

var scrollTo = function (element) {
    if (control.enableScrolling && !control.scrolling) {
        control.scrolling = true;
        var pos = element.offset();
        $("html, body").animate({scrollTop: (pos.top - 40)}, 600, "swing", function () {
            control.scrolling = false;
        });
    }
};

var resize = function () {
    var width = $('#panel-requerimientos').width(); // lame..
    for (var i in control.chartInfo) {
        var chart = control.chartInfo[i];

        chart.width(width * 4 / 5);
        if (chart.hasOwnProperty("rescale")) {
            chart.rescale();
        }
        if (chart.hasOwnProperty("redraw")) {
            chart.redraw();
        }
    }
    dc.redrawAll();
};

var updateProgress = function (step, totalCount) {
    step += 0.5;
    $('#progress').text((100 * step / totalCount) + " %");
    return step;
};

var loadData = function () {
    var me = this;
    var datasetCount = Object.keys(control.dataTable.datasetColumns).length,
        datasetsFinished = 0;
    var successCallback = function (data, dataType) {
        me.control.data[dataType] = data;

        datasetsFinished = updateProgress(datasetsFinished, datasetCount);
        drawData(data, dataType);

        datasetsFinished = updateProgress(datasetsFinished, datasetCount);
        if (datasetsFinished == datasetCount) {
            resize();
            finishLoading();
        }
    };
    $.each(control.dataTable.datasetColumns, function (dataset, columns) {
        loadCsvDataset(dataset, successCallback);
//        loadJsonDataset(dataset, successCallback);
    });
};

// Currently unused, JSON is more flexible but bigger
var loadJsonDataset = function (dataset, successCallback) {
    var data = {};
    $.ajax({
        url: "data/" + dataset + ".json",
        async: true,
        success: function (jsonData) {
            data = $.parseJSON(jsonData);
        },
        complete: function () {
            successCallback(data, dataset);
        },
        dataType: "text"
    });
};

var loadCsvDataset = function (dataset, successCallback) {
    var fileName = "data/" + dataset + ".csv";
    var formatter = function (row) {
        row.HAS_ERROR = (row.HAS_ERROR == "TRUE");
        if (!isNaN(row.IMPORTE_RECLA_UNIQ))
            row.IMPORTE_RECLA_UNIQ = +row.IMPORTE_RECLA_UNIQ;
        else
            row.IMPORTE_RECLA_UNIQ = 0;
        return row;
    };
    var callback = function (error, data) {
        successCallback(data, dataset);
    };
    d3.csv(fileName, formatter, callback);
};

var loadMap = function (params) {

    // Leaflet's image path
    L.Icon.Default.imagePath = 'dist/css/leaflet/images/';

    var map = L.map('map');

    L.tileLayer(params.baseTile).addTo(map);
    L.marker({lat: params.defaultLat, lng: params.defaultLon}, {
            clickable: true,
            draggable: false
        })
        .bindPopup("<h3>Madrid</h3><br/><p>No errors</p>")
        .addTo(map);

    map.setView(
        [params.defaultLat, params.defaultLon],
        params.defaultZoom);
};

// from: https://github.com/dc-js/dc.js/blob/master/web/examples/table-control.dataTable.pagination.html
var display = function () {
    d3.select('#begin').text(1 + control.dataTable.offset);
    d3.select('#end').text(Math.min(control.dataTable.size, control.dataTable.offset + control.dataTable.pagination));
    d3.select('#last').attr('disabled', control.dataTable.offset - control.dataTable.pagination < 0 ? 'true' : null);
    d3.select('#next').attr('disabled', control.dataTable.offset + control.dataTable.pagination >= control.dataTable.size ? 'true' : null);
    d3.select('#size').text(control.dataTable.size);
    control.dataTable.current.render();
    control.dataTable.current.redraw();
};

var update = function () {
    control.dataTable.current.beginSlice(control.dataTable.offset);
    control.dataTable.current.endSlice(control.dataTable.offset + control.dataTable.pagination);
    display();
};

var next = function () {
    control.dataTable.offset += control.dataTable.pagination;
    update();
};

var last = function () {
    control.dataTable.offset -= control.dataTable.pagination;
    update();
};
// Based on: http://bl.ocks.org/stevemandl/02febfc129131db79adf
var updatingCrossfilter = function (cbk, dimensions) {
    var c = crossfilter(); //the underlying crossfilter
    //allows the client to subscribe to update events
    var _listener = d3.dispatch("update", "startUpdate");

    // registers an event handler
    c.on = function (event, listener) {
        _listener.on(event, listener);
        return c;
    };

    //backup add and remove for later
    c._add = c.add;
    c._remove = c.remove;

    // add new data
    c.add = function (newData) {
        return c._add(newData);
    };

    //remove data matching the current filter(s)
    c.remove = function () {
        dimensions.forEach(function (dim) {
            dim.filter(null);
        });
        c._remove();
    };

    //update newData by replacing the elements with matching id's
    c.update = function (newData) {
        _listener.startUpdate();
        c.liftFilters();
        newData.forEach(function (d) {
            c.remove();
        }, this);
        c.add(newData);
        c.restoreFilters();
        _listener.update();
        return c;
    };

    //update newData by replacing the elements with matching id's
    c.replace = function (newData) {
        _listener.startUpdate();
        c.liftFilters();
        newData.forEach(function (d) {
            c.remove();
        }, this);
        c.add(newData);
        c.restoreFilters();
        _listener.update();
        return c;
    };

    //temporarily lift filters from all charts' dimensions, saving them to for restoreFilters() later
    c.liftFilters = function () {
        dc.chartRegistry.list().forEach(function (d) {
            d._liftedFilters = d.filters();
            d.filterAll();
        });
        return c;
    };

    //restore filters to charts' dimensions previously saved by liftFilters()
    c.restoreFilters = function () {
        dc.chartRegistry.list().forEach(function (d) {
            if (d._liftedFilters) {
                d._liftedFilters.map(d.filter);
                delete d._liftedFilters;
            }
        });
        return c;
    };

    //sanitize cbk as a function
    if (cbk && typeof arguments[0] != "function") {
        var o = cbk;
        cbk = function (c) {
            return c.add(o);
        };
    }

    if (cbk) {
        cbk(c);
    }
    return c;
};