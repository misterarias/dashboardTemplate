$(window).load(function () {

    // Table starts off-loaded
    $(control.dataTable.anchor).hide();

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

var control = {
    ndx: {},
    scrolling: false,
    slider: {
        min: 0, max: 1e8
    },
    dataTable: {
        pagination: 12,
        anchor: '#details-table',
        offset: 0,
        currentDatasetName: undefined,
        firstColumn: [tableColumn("#ID", function (d) {
            return d.ID_PROCESO
        })],
        lastColumn: [tableColumn("Error?", function (d) {
            return (d.HAS_ERROR) ? 'Si' : 'No'
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
                    return formatNumber(d.COSTAS);
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
    }

};

var renderLabels = function () {
    $('.label_total_items').text("Registros");
    $('.label_total_errors').text("Registros c/errores");
    $('.label_importe_total').text("Importe reclamado(€)");
    $('.label_importe_perdido').text("Reclamado c/error(€)");
};

var setupSlider = function () {

    $("input#slider").slider(
        {
            min: this.control.slider.min,
            max: this.control.slider.max,
            scale: 'logarithmic',
            //      orientation: 'vertical', tooltip_position: 'right',
            //      reversed: true,
            formatter: function (value) {
                return 'Desde ' + formatNumber(value);
            }
        })
        .on('slideStop', function (slideEvt) {
            onFilter("importe", slideEvt.value);
        })
    ;
    $(".slider").attr("style", "margin: 0; width: 88%;");
};

var formatNumber = function (number) {
    if (number) {
        return number.toLocaleString().replace(/,/g, 'PLACEHOLDER')
            .replace(/\./g, ',')
            .replace(/PLACEHOLDER/g, '.')
            ;// + " €";
    }
    return "";
};

var onFilter = function (field, newLimit) {
    control.limits[field] = parseInt(newLimit);
    drawData();

    if (control.dataTable.currentDatasetName) {
        var currentDataset = control.data[control.dataTable.currentDatasetName];
        drawDataTable(getFilteredDataset(currentDataset));
    }
};

var drawData = function () {
    $.each(this.control.data, function (type, data) {
        var filteredDataset = getFilteredDataset(data);

        drawPieChart(filteredDataset, type);
        $('#panel-' + type + ' .panel-heading').on('click', function () {
            control.dataTable.currentDatasetName = type;
            showDataTable();
            drawDataTable(filteredDataset);
        });
    });
};

var getFilteredDataset = function (rawData) {
    var data = rawData;
    if (control.limits.importe >= 0) {
        data = rawData.filter(function (d) {
            return (parseInt(d.IMPORTE_RECLA_UNIQ) > control.limits.importe);
        });
    }
    return data;
};

var drawPieChart = function (data, type) {

    var importeTotal = 0, importePerdido = 0,
        totalClientes = data.length,
        totalErrores = 0, totalNan = 0
        ;
    data.forEach(function (d) {
        if (!isNaN(d.IMPORTE_RECLA_UNIQ)) {
            d.IMPORTE_RECLA_UNIQ = parseInt(d.IMPORTE_RECLA_UNIQ);
            importeTotal += d.IMPORTE_RECLA_UNIQ;
            importePerdido += (d.HAS_ERROR) ? d.IMPORTE_RECLA_UNIQ : 0;
        } else {
            totalNan += 1
        }
        totalErrores += (d.HAS_ERROR) ? 1 : 0;
    });

    var summary = $('#' + type + 'Summary');
    summary.find('span.total_items').text(formatNumber(totalClientes));
    summary.find('span.error_items').text(formatNumber(totalErrores));
    summary.find('span.total').text(formatNumber(importeTotal));
    summary.find('span.error').text(formatNumber(importePerdido));

    if (!control.ndx.hasOwnProperty(type)) {
        control.ndx[type] = updatingCrossfilter(data, []); // TODO: Add dimensions
    } else {
        control.ndx[type].replace(data);
    }

    var errorDimension = control.ndx[type].dimension(function (v) {
        return v.HAS_ERROR == true;
    });
    var errorGroup = errorDimension.group();

    var errorTxt = "Error", okTxt = "OK";
    var colorScale = d3.scale.ordinal()
        .domain([false, true])
        .range(['#3c763d', '#a94442'])
        ;
    var pieChart = dc.pieChart("#" + type + "PieChart")
        .dimension(errorDimension)
        .group(errorGroup)
        .title(function (v) {
            if (v.key) {
                return "Resoluciones erróneas: " + totalErrores;
            } else {
                return "Resoluciones con éxito: " + totalClientes;
            }
        })
        .colors(function (HAS_ERROR) {
            return colorScale(HAS_ERROR == true);
        })
        .on('pretransition', function (chart) {
            chart.selectAll('text.pie-slice').text(function (d) {
                var text = (!d.data.key) ? okTxt : errorTxt;
                return text + ' ' + dc.utils.printSingleValue((d.endAngle - d.startAngle) / (2 * Math.PI) * 100) + '%';
            })
        })
        .render()
        ;
    control.chartInfo.push(pieChart);

    // resize();
};

var showDataTable = function () {
    var table = $(control.dataTable.anchor);
    table.fadeIn("slow");
    scrollTo(table);
};

var drawDataTable = function (data) {

    var ndx = crossfilter(data);
    var columns = control.dataTable.firstColumn
        .concat(control.dataTable.datasetColumns[control.dataTable.currentDatasetName])
        .concat(control.dataTable.lastColumn)
        ;
    control.dataTable.current = dc.dataTable('#dc-data-table')
        .dimension(ndx.dimension(function (x) {
            return x;
        }))
        .group(function (d) {
            return ''; // cheap trick: group by nothing so the 'striped' effect kicks-in
        })
        .showGroups(false) // removes the grouping line at the top
        .size(Infinity) // So we can use pagination
        .columns(columns)
        .sortBy(function (d) {
            return d.FECHA_INICIO;
        })
    ;

    control.dataTable.size = data.length; //ndx.size();
    control.dataTable.offset = 0; // reset
    update();
};

var scrollTo = function (element) {
    if (!control.scrolling) {
        control.scrolling = true;
        var pos = element.offset();
        $("html, body").animate({scrollTop: (pos.top - 40)}, 600, "swing", function () {
            control.scrolling = false;
        });
    }
};

var resize = function () {
    console.log("RESIZE")
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
        chart.render();
    }
    dc.redrawAll();
};

var loadData = function () {
    var me = this;
    var dataSetsPending = Object.keys(control.dataTable.datasetColumns).length;
    $.each(control.dataTable.datasetColumns, function (dataset, columns) {
        var data = {};
        $.ajax({
            url: "data/" + dataset + ".json",
            async: true,
            success: function (jsonData) {
                data = $.parseJSON(jsonData);
                me.control.data[dataset] = data;

                me.control.slider.max = Math.max(
                    d3.max(data, function (d) {
                        return parseInt(d.IMPORTE_RECLA_UNIQ);
                    }),
                    me.control.slider.max
                );
                me.control.slider.min = Math.min(
                    d3.min(data, function (d) {
                        return parseInt(d.IMPORTE_RECLA_UNIQ);
                    }),
                    me.control.slider.min
                );
            },
            dataType: "text",
            complete: function () {
                drawData();
                if (--dataSetsPending == 0) {
                    finishLoading();
                }
            }
        });
    });
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