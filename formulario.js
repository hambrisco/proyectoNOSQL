// Reemplazar LocalStorage por llamadas a la API
async function cargarObservacionesDesdeMongoDB() {
    try {
        const respuesta = await fetch('http://localhost:3000/api/observaciones');
        if (!respuesta.ok) throw new Error('Error al cargar observaciones');
        observaciones = await respuesta.json();
        mostrarObservaciones();
    } catch (err) {
        console.error('Error:', err);
        mostrarMensajeError('Error al cargar observaciones. Intente más tarde.');
    }
}

async function guardarObservacionEnMongoDB(observacion) {
    let metodo, url, body;
    if (editando && observacion._id) {
        metodo = 'PUT';
        url = `http://localhost:3000/api/observaciones/${observacion._id}`;
        // Solo enviar _id en edición
        body = JSON.stringify(observacion);
    } else {
        metodo = 'POST';
        url = 'http://localhost:3000/api/observaciones';
        // No enviar _id ni id en creación
        const obsSinId = { ...observacion };
        delete obsSinId._id;
        delete obsSinId.id;
        body = JSON.stringify(obsSinId);
    }
    try {
        const respuesta = await fetch(url, {
            method: metodo,
            headers: { 'Content-Type': 'application/json' },
            body: body
        });
        if (!respuesta.ok) {
            const datosError = await respuesta.json().catch(() => null);
            throw new Error(datosError?.message || `Error al ${editando ? 'actualizar' : 'crear'} la observación`);
        }
        const datos = await respuesta.json();
        if (!datos) {
            throw new Error('No se recibió respuesta del servidor');
        }
        return datos;
    } catch (err) {
        console.error('Error al guardar observación:', err);
        throw new Error(err.message || 'Error en la comunicación con el servidor');
    }
}

async function eliminarObservacionDeMongoDB(id) {
    try {
        const respuesta = await fetch(`http://localhost:3000/api/observaciones/${id}`, { method: 'DELETE' });
        if (!respuesta.ok) throw new Error('Error al eliminar');
        return true;
    } catch (err) {
        console.error('Error:', err);
        throw err;
    }
}
// Variables globales
let observaciones = [];
let editando = false;
let idEdicion = null;
const ubicacionPredeterminada = [-33.4489, -70.6693]; // Santiago, Chile
const zoomPredeterminado = 13;
let mapa = null;
let marcador = null;

// Inicializa el mapa Leaflet
function inicializarMapa() {
    if (mapa) {
        mapa.remove();
    }
    $('#map').css({
        'height': '400px',
        'width': '100%',
        'margin-bottom': '20px'
    });
    mapa = L.map('map').setView(ubicacionPredeterminada, zoomPredeterminado);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '© OpenStreetMap'
    }).addTo(mapa);
    setTimeout(() => {
        mapa.invalidateSize();
    }, 100);
    return mapa;
}

// Evento para mostrar/ocultar el mapa y seleccionar coordenadas
function configurarBotonMapa() {
    $('#btnMapa').off('click').on('click', function() {
        const mapDiv = $('#map');
        if (mapDiv.css('display') === 'none') {
            mapDiv.show();
            $(this).text('Cerrar mapa');
            setTimeout(() => {
                mapa = inicializarMapa();
                mapa.on('click', function(e) {
                    if (marcador) {
                        mapa.removeLayer(marcador);
                    }
                    marcador = L.marker(e.latlng).addTo(mapa);
                    $('#coordenadas').text(`Coordenadas: ${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`);
                    fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${e.latlng.lat}&lon=${e.latlng.lng}`)
                        .then(respuesta => respuesta.json())
                        .then(datos => {
                            if (datos.display_name) {
                                $('#ubicacion').val(datos.display_name);
                            }
                        })
                        .catch(err => {
                            console.error('Error en geocoding:', err);
                            $('#ubicacion').val(`${e.latlng.lat}, ${e.latlng.lng}`);
                        });
                });
            }, 100);
        } else {
            mapDiv.hide();
            $(this).text('Seleccionar en el mapa');
            if (mapa) {
                mapa.remove();
                mapa = null;
            }
        }
    });
    $('#ubicacion').on('input', function() {
        $('#coordenadas').text('');
    });
}

// Document ready
$(document).ready(function() {
    cargarAvesDesdeAPI();
    cargarObservacionesDesdeMongoDB();
    $('#ave').change(mostrarInformacionAve);
    $('#formularioAves').submit(manejarEnvioFormulario);
    $('#btnLimpiar').click(limpiarFormulario);
    configurarBotonMapa();
});

// Función para cargar las aves desde el JSON (API)
function cargarAvesDesdeAPI() {
    // Consumir la API externa de aves
    console.log('Solicitando aves a la API...');
    $.ajax({
        url: 'https://aves.ninjas.cl/api/birds',
        method: 'GET',
        dataType: 'json',
        success: function(datos) {
            console.log('Respuesta de la API aves:', datos);
            llenarSelectAves(datos);
        },
        error: function(err) {
            console.error('Error al cargar las aves:', err);
            mostrarMensajeError('Error al cargar la lista de aves. Intente recargar la página.');
        }
    });
}

// Llenar el select con las aves
function llenarSelectAves(aves) {
    // Ordenar aves alfabéticamente por nombre en español
    aves.sort((a, b) => a.name.spanish.localeCompare(b.name.spanish));
    const select = $('#ave');
    // Destruir select2 anterior si existe
    if (select.hasClass('select2-hidden-accessible')) {
        select.select2('destroy');
    }
    select.empty();
    if (!Array.isArray(aves) || aves.length === 0) {
        console.warn('No se recibieron aves para mostrar.');
        select.append('<option disabled>No se encontraron aves</option>');
        // Inicializar select2 para mostrar placeholder aunque esté vacío
        select.select2({
            width: '100%',
            placeholder: 'Seleccione las aves observadas',
            allowClear: true,
            multiple: true,
            language: 'es'
        });
        return;
    }
    // Agregar las aves al select y guardar los datos completos
    window._avesArray = aves; // Guardar array global
    aves.forEach(ave => {
        const option = $('<option>', {
            value: ave.uid,
            text: `${ave.name.spanish} (${ave.name.latin})`,
            'data-image': ave.images?.thumb || ave.images?.main || '',
            'data-spanish': ave.name.spanish,
            'data-latin': ave.name.latin,
            'data-english': ave.name.english
        });
        select.append(option);
    });
    // Inicializar select2 con opciones mejoradas
    select.select2({
        width: '100%',
        placeholder: 'Seleccione las aves observadas',
        allowClear: true,
        multiple: true,
        language: 'es',
        templateResult: formatearOpcionAve,
        templateSelection: formatearSeleccionAve,
        escapeMarkup: function(markup) {
            return markup;
        }
    });
    console.log('Aves cargadas en el select:', aves.length);
    // Función para formatear cada opción en la lista desplegable
    // Función para formatear la opción en el menú desplegable
    function formatearOpcionAve(ave) {
        if (!ave.id) return ave.text;
        const option = $(ave.element);
        const imageUrl = option.data('image');
        const spanishName = option.data('spanish');
        const latinName = option.data('latin');
        const englishName = option.data('english');
        
        return $(`
            <div class="opcion-ave">
                <img src="${imageUrl}" 
                     alt="${spanishName}" 
                     style="width: 60px; height: 60px; object-fit: cover; margin-right: 12px; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="flex-grow: 1;">
                    <div style="font-weight: bold; font-size: 1.1em; color: #2c3e50;">
                        ${spanishName}
                    </div>
                    <div style="font-size: 0.9em; color: #666;">
                        ${englishName}
                    </div>
                    <div style="font-style: italic; font-size: 0.85em; color: #888;">
                        ${latinName}
                    </div>
                </div>
            </div>
        `);
    }

    // Función para formatear el ave ya seleccionada
    function formatearSeleccionAve(ave) {
        if (!ave.id) return ave.text;
        const option = $(ave.element);
        const imageUrl = option.data('image');
        const spanishName = option.data('spanish');
        
        return $(`
            <div style="display: flex; align-items: center; gap: 8px;">
                <img src="${imageUrl}" 
                     alt="${spanishName}" 
                     style="width: 30px; height: 30px; object-fit: cover; border-radius: 4px;">
                <span>${spanishName}</span>
            </div>
        `);
    }
    // Buscar usuario y mostrar sus avistamientos
    $('#btnBuscarUsuario').click(async function() {
        const consulta = $('#buscarUsuario').val().trim().toLowerCase();
        if (!consulta) {
            mostrarMensajeError('Por favor ingrese un nombre o email para buscar');
            return;
        }
        let lista = observaciones.filter(obs =>
            obs.nombreObservador.toLowerCase().includes(consulta) ||
            obs.email.toLowerCase().includes(consulta)
        );
        mostrarResultadosUsuario(lista, consulta);
        
        if (lista.length === 0) {
            $('#resultadosUsuario').html(`
                <div style="padding: 15px; background-color: #f8f9fa; border-radius: 6px; text-align: center;">
                    <p style="margin: 0; color: #666;">No se encontraron observaciones para: <strong>${consulta}</strong></p>
                </div>
            `);
        }
    });
    
    // Añadir búsqueda al presionar Enter en el campo de búsqueda
    $('#buscarUsuario').on('keypress', function(e) {
        if (e.which === 13) {
            $('#btnBuscarUsuario').click();
        }
    });
}

// Mostrar información del ave seleccionada
function mostrarInformacionAve() {
    const seleccion = $('#ave').val() || [];
    if (seleccion.length === 0) {
        $('#infoAve').hide();
        return;
    }
    const avesSeleccionadas = (window._avesArray || []).filter(a => seleccion.includes(a.uid));
    $('#infoAve').empty();
    const numSeleccionadas = avesSeleccionadas.length;
    $('#infoAve').append(`
        <div class="aves-seleccionadas">
            <strong>${numSeleccionadas} ${numSeleccionadas === 1 ? 'ave seleccionada' : 'aves seleccionadas'}</strong>
        </div>
    `);
    // Mostrar información detallada de todas las aves seleccionadas
    avesSeleccionadas.forEach(ave => {
        $('#infoAve').append(`
            <div class="ave-details">
                <img src="${ave.images.main}" alt="${ave.name.spanish}" class="ave-imagen">
                <div class="ave-info">
                    <p><strong>Nombre español:</strong> ${ave.name.spanish}</p>
                    <p><strong>Nombre inglés:</strong> ${ave.name.english}</p>
                    <p><strong>Nombre científico:</strong> <em>${ave.name.latin}</em></p>
                </div>
            </div>
        `);
    });
    // Lista resumen
    if (numSeleccionadas > 1) {
        const listaAves = $('<div class="aves-lista"><h4>Todas las aves seleccionadas:</h4><ul></ul></div>');
        avesSeleccionadas.forEach(ave => {
            listaAves.find('ul').append(`<li>${ave.name.spanish} <em>(${ave.name.latin})</em></li>`);
        });
        $('#infoAve').append(listaAves);
    }
    $('#infoAve').show();
}

// Manejar el envío del formulario
async function manejarEnvioFormulario(e) {
    e.preventDefault();
    if (!validarFormulario()) {
        return;
    }
    try {
        const seleccion = $('#ave').val() || [];
        const avesSeleccionadas = (window._avesArray || []).filter(a => seleccion.includes(a.uid));
        const avesFormateadas = avesSeleccionadas.map(ave => ({
            id: ave.uid,
            nombreEspanol: ave.name.spanish,
            nombreIngles: ave.name.english,
            nombreCientifico: ave.name.latin,
            imagenUrl: ave.images.main
        }));

        const observacion = {
            nombreObservador: $('#nombreObservador').val().trim(),
            email: $('#email').val().trim(),
            fechaObservacion: $('#fechaObservacion').val(),
            ubicacion: {
                nombre: $('#ubicacion').val().trim(),
                coordenadas: marcador ? {
                    lat: marcador.getLatLng().lat,
                    lng: marcador.getLatLng().lng
                } : undefined
            },
            aves: avesFormateadas,
            comentarios: $('#comentarios').val().trim(),
            fechaRegistro: new Date().toISOString()
        };
        if (editando && idEdicion) {
            observacion._id = idEdicion;
        } else {
            delete observacion._id;
            delete observacion.id;
        }
        await guardarObservacionEnMongoDB(observacion);
        limpiarFormulario();
        await cargarObservacionesDesdeMongoDB();
        mostrarMensajeExito(editando ? 'Observación actualizada correctamente' : 'Observación agregada correctamente');
        editando = false;
        idEdicion = null;
    } catch (err) {
        console.error('Error al procesar la observación:', err);
        mostrarMensajeError('Error al guardar la observación: ' + (err.message || 'Error desconocido'));
    }
}

// Validar el formulario
function validarFormulario() {
    let valido = true;
    
    // Validar nombre
    if ($('#nombreObservador').val().trim() === '') {
        $('#errorNombre').text('Por favor ingrese su nombre');
        valido = false;
    } else {
        $('#errorNombre').text('');
    }
    
    // Validar email
    const email = $('#email').val();
    if (!email || !validarEmail(email)) {
        $('#errorEmail').text('Por favor ingrese un email válido');
        valido = false;
    } else {
        $('#errorEmail').text('');
    }
    
    // Validar fecha
    if (!$('#fechaObservacion').val()) {
        $('#errorFecha').text('Por favor seleccione una fecha');
        valido = false;
    } else {
        $('#errorFecha').text('');
    }
    
    // Validar ubicación
    if ($('#ubicacion').val().trim() === '') {
        $('#errorUbicacion').text('Por favor ingrese una ubicación');
        valido = false;
    } else {
        $('#errorUbicacion').text('');
    }
    
    // Validar ave(s)
    if ($('#ave').val() === null || $('#ave').val().length === 0) {
        $('#errorAve').text('Por favor seleccione al menos un ave');
        valido = false;
    } else {
        $('#errorAve').text('');
    }
    
    // Comentarios es opcional, no validar
    
    return valido;
}

// Validar formato de email
function validarEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}
// Agregar nueva observación
function agregarObservacion(observacion) {
    // Ya no se usa LocalStorage. CRUD se hace por API.
}

// Actualizar observación existente
function actualizarObservacion(observacionActualizada) {
    // Ya no se usa LocalStorage. CRUD se hace por API.
}

// Eliminar observación
function eliminarObservacion(id) {
    if (confirm('¿Está seguro que desea eliminar esta observación?')) {
        eliminarObservacionDeMongoDB(id)
            .then(() => {
                cargarObservacionesDesdeMongoDB();
                mostrarMensajeExito('Observación eliminada correctamente');
            })
            .catch(() => mostrarMensajeError('Error al eliminar la observación.'));
    }
}

// Editar observación
function editarObservacion(id) {
    // Buscar por id como string
    const observacion = observaciones.find(obs => String(obs._id) === String(id));
    if (!observacion) return;
    $('#nombreObservador').val(observacion.nombreObservador);
    $('#email').val(observacion.email);
    $('#fechaObservacion').val(observacion.fechaObservacion);
    $('#ubicacion').val(observacion.ubicacion.nombre);
    // Si hay coordenadas, mostrar el marcador en el mapa
    if (observacion.ubicacion.coordenadas) {
        $('#map').show();
        $('#btnMapa').text('Cerrar mapa');
        setTimeout(() => {
            if (!mapa) {
                mapa = inicializarMapa();
            }
            if (marcador) {
                mapa.removeLayer(marcador);
            }
            marcador = L.marker([
                observacion.ubicacion.coordenadas.lat,
                observacion.ubicacion.coordenadas.lng
            ]).addTo(mapa);
            mapa.setView([
                observacion.ubicacion.coordenadas.lat,
                observacion.ubicacion.coordenadas.lng
            ], 13);
            mapa.invalidateSize();
        }, 100);
    }
    if (observacion.aves && Array.isArray(observacion.aves)) {
        const ids = observacion.aves.map(a => a.id);
        $('#ave').val(ids).trigger('change');
    } else if (observacion.aveId) {
        $('#ave').val([observacion.aveId]).trigger('change');
    }
    $('#comentarios').val(observacion.comentarios);
    editando = true;
    idEdicion = String(id);
    $('#btnGuardar').text('Actualizar Observación');
    $('html, body').animate({ scrollTop: 0 }, 'slow');
}

// Mostrar todas las observaciones en la tabla
// Mostrar resultados de búsqueda de usuario
function mostrarResultadosUsuario(lista, criterio) {
    const div = $('#resultadosUsuario');
    if (!lista.length) {
        return; // El mensaje vacío se maneja en la función de búsqueda
    }
    
    let html = `
        <div style="background: #fff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); padding: 20px; margin-bottom: 20px;">
            <h3 style="margin-top: 0; color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">
                Resultados de búsqueda: "${criterio}"
                <span style="float: right; color: #666; font-size: 0.9em;">${lista.length} resultado(s)</span>
            </h3>
            <div style="max-height: 400px; overflow-y: auto;">
    `;
    
    lista.forEach(obs => {
        const fecha = new Date(obs.fechaObservacion).toLocaleDateString('es-CL');
        const avesInfo = obs.aves && Array.isArray(obs.aves)
            ? obs.aves.map(a => `
                <div style="display: inline-block; margin: 2px 5px; padding: 3px 8px; background: #e3f2fd; border-radius: 12px; font-size: 0.9em;">
                    ${a.nombreEspanol}
                </div>`).join('')
            : '<span style="color: #666;">Sin aves registradas</span>';
            
        html += `
            <div style="padding: 15px; margin: 10px 0; background: #f8f9fa; border-radius: 6px; border-left: 4px solid #3498db;">
                <div style="margin-bottom: 8px;">
                    <strong style="font-size: 1.1em; color: #2c3e50;">${obs.nombreObservador}</strong>
                    <span style="color: #666; margin-left: 10px;">${obs.email}</span>
                </div>
                <div style="color: #666; font-size: 0.9em;">
                    <i class="fas fa-calendar"></i> ${fecha}
                </div>
                <div style="color: #666; font-size: 0.9em;">
                    <i class="fas fa-map-marker-alt"></i> ${obs.ubicacion.nombre || 'Ubicación no especificada'}
                </div>
                <div style="margin-top: 10px;">
                    ${avesInfo}
                </div>
            </div>`;
    });
    
    html += '</div></div>';
    div.html(html);
}

function mostrarObservaciones() {
    const tbody = $('#tablaObservaciones tbody');
    tbody.empty();
    
    if (observaciones.length === 0) {
        tbody.append('<tr><td colspan="6">No hay observaciones registradas</td></tr>');
        return;
    }
    
    observaciones.forEach(obs => {
        const fecha = new Date(obs.fechaObservacion).toLocaleDateString('es-CL');
        const avesHtml = (obs.aves && Array.isArray(obs.aves))
            ? obs.aves.map(a => `<div><b>${a.nombreEspanol}</b> <span style='font-size:12px;color:#888;'>(${a.nombreCientifico})</span></div>`).join('')
            : obs.aveNombre || '';
        tbody.append(`
            <tr>
                <td>${obs.nombreObservador}</td>
                <td>${obs.email}</td>
                <td>${fecha}</td>
                <td>${obs.ubicacion.nombre || ''}</td>
                <td>${avesHtml}</td>
                <td>
                    <button class="btn-editar" data-id="${obs._id}">Editar</button>
                    <button class="btn-eliminar" data-id="${obs._id}">Eliminar</button>
                </td>
            </tr>
        `);
    });
    // Asignar eventos a los botones
    $('.btn-editar').off('click').on('click', function() {
        const id = $(this).attr('data-id');
        editarObservacion(id);
    });
    $('.btn-eliminar').off('click').on('click', function() {
        const id = $(this).attr('data-id');
        eliminarObservacion(id);
    });
}

// Cargar observaciones desde LocalStorage
function cargarObservacionesDesdeLocalStorage() {
    // Eliminado: ya no se usa LocalStorage
}

// Guardar observaciones en LocalStorage
function guardarObservacionesEnLocalStorage() {
    // Eliminado: ya no se usa LocalStorage
}

// Limpiar el formulario
function limpiarFormulario() {
    $('#formularioAves')[0].reset();
    $('#ave').val([]).trigger('change'); // Limpiar selección múltiple
    $('#infoAve').hide().empty();
    $('.mensaje-error').text('');
    $('#coordenadas').text('');
    
    if (editando) {
        editando = false;
        idEdicion = null;
        $('#btnGuardar').text('Guardar Observación');
    }
}

// Mostrar mensaje de éxito
function mostrarMensajeExito(mensaje) {
    const div = $('<div>')
        .addClass('mensaje-exito')
        .text(mensaje)
        .css({
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '15px 25px',
            background: '#4CAF50',
            color: 'white',
            borderRadius: '5px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            zIndex: 1000
        });
    
    $('body').append(div);
    
    setTimeout(() => {
        div.fadeOut('slow', function() {
            $(this).remove();
        });
    }, 3000);
}

// Mostrar mensaje de error
function mostrarMensajeError(mensaje) {
    const div = $('<div>')
        .addClass('mensaje-error')
        .text(mensaje)
        .css({
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '15px 25px',
            background: '#f44336',
            color: 'white',
            borderRadius: '5px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            zIndex: 1000
        });
    
    $('body').append(div);
    
    setTimeout(() => {
        div.fadeOut('slow', function() {
            $(this).remove();
        });
    }, 5000);
}
