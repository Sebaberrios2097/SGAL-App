import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Coffee, 
  Tag, 
  FolderPlus, 
  Calendar, 
  AlertCircle, 
  CheckCircle2, 
  X, 
  Percent, 
  Image as ImageIcon,
  Package,
  Upload,
  ClipboardList
} from 'lucide-react';
import SearchableSelect from '../components/SearchableSelect';
import { useNavigate } from 'react-router-dom';

const InventoryManagement = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('products'); // 'products' | 'offers'
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modals state
  const [showProductModal, setShowProductModal] = useState(false);
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  
  // Quick Category add state (inline inside product modal)
  const [showQuickCategory, setShowQuickCategory] = useState(false);
  const [quickCategoryName, setQuickCategoryName] = useState('');
  const [quickCategoryError, setQuickCategoryError] = useState('');

  // Editing items state
  const [editingProduct, setEditingProduct] = useState(null);
  
  // Forms state
  const [productForm, setProductForm] = useState({
    idCategoriaProducto: '',
    nombreProducto: '',
    descripcionProducto: '',
    precio: '',
    stock: '',
    requiereReceta: false
  });

  const [imagePreview, setImagePreview] = useState(null);
  const [imageBytes, setImageBytes] = useState(null); // base64 string
  
  const [discountForm, setDiscountForm] = useState({
    idProducto: '',
    porcentajeDescuento: '',
    fechaInicioDescuento: '',
    fechaTerminoDescuento: ''
  });

  // Categories CRUD sub-state
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryForm, setCategoryForm] = useState({
    nombreCategoriaProducto: ''
  });
  const [categoryError, setCategoryError] = useState('');

  // Styling helper for premium inputs to match the custom DDL style
  const inputStyle = {
    width: '100%',
    padding: '10px 14px',
    backgroundColor: '#ffffff',
    border: '1px solid var(--panel-border)',
    borderRadius: '10px',
    fontSize: '0.9rem',
    color: 'var(--text-main)',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s ease',
    height: '42px'
  };

  useEffect(() => {
    document.title = "Gestión de Inventario - Siete Vidas";
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [prodRes, catRes, discRes] = await Promise.all([
        fetch('/api/product'),
        fetch('/api/category'),
        fetch('/api/discount')
      ]);

      if (!prodRes.ok || !catRes.ok || !discRes.ok) {
        throw new Error('Error al cargar datos del servidor');
      }

      const prodData = await prodRes.json();
      const catData = await catRes.json();
      const discData = await discRes.json();

      setProducts(prodData);
      setCategories(catData);
      setDiscounts(discData);
    } catch (e) {
      setError(e.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const reloadProducts = async () => {
    try {
      const res = await fetch('/api/product');
      if (res.ok) setProducts(await res.json());
    } catch (e) { console.error(e); }
  };

  const reloadCategories = async () => {
    try {
      const res = await fetch('/api/category');
      if (res.ok) setCategories(await res.json());
    } catch (e) { console.error(e); }
  };

  const reloadDiscounts = async () => {
    try {
      const res = await fetch('/api/discount');
      if (res.ok) setDiscounts(await res.json());
    } catch (e) { console.error(e); }
  };

  // Image upload handler
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
        setImageBytes(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClearImage = () => {
    setImagePreview(null);
    setImageBytes(''); // empty string tells server to clear image
  };

  // Product CRUD
  const handleOpenCreateProduct = () => {
    setEditingProduct(null);
    setProductForm({
      idCategoriaProducto: '',
      nombreProducto: '',
      descripcionProducto: '',
      precio: '',
      stock: '',
      requiereReceta: false
    });
    setImagePreview(null);
    setImageBytes(null);
    setError('');
    setSuccess('');
    setShowProductModal(true);
  };

  const handleOpenEditProduct = (prod) => {
    setEditingProduct(prod);
    setProductForm({
      idCategoriaProducto: prod.idCategoriaProducto,
      nombreProducto: prod.nombreProducto,
      descripcionProducto: prod.descripcionProducto || '',
      precio: prod.precio,
      stock: prod.stock !== null && prod.stock !== undefined ? prod.stock : '',
      requiereReceta: Boolean(prod.requiereReceta)
    });
    setImagePreview(prod.imagenBase64 ? `data:image/png;base64,${prod.imagenBase64}` : null);
    setImageBytes(null); // Keep unchanged unless modified
    setError('');
    setSuccess('');
    setShowProductModal(true);
  };

  const handleProductSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!productForm.nombreProducto.trim()) {
      setError('El nombre del producto es obligatorio');
      return;
    }
    if (!productForm.idCategoriaProducto) {
      setError('Debe seleccionar una categoría');
      return;
    }
    if (parseInt(productForm.precio) <= 0) {
      setError('El precio debe ser un número positivo');
      return;
    }

    const payload = {
      idCategoriaProducto: parseInt(productForm.idCategoriaProducto),
      nombreProducto: productForm.nombreProducto,
      descripcionProducto: productForm.descripcionProducto || null,
      precio: parseInt(productForm.precio),
      stock: productForm.requiereReceta ? null : (productForm.stock !== '' ? parseInt(productForm.stock) : null),
      requiereReceta: productForm.requiereReceta,
      imagenBase64: imageBytes
    };

    try {
      let res;
      if (editingProduct) {
        res = await fetch(`/api/product/${editingProduct.idProducto}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch('/api/product', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.mensaje || 'Error al guardar el producto');
      }

      setSuccess(editingProduct ? 'Producto actualizado con éxito' : 'Producto creado con éxito');
      setShowProductModal(false);
      reloadProducts();
      setTimeout(() => setSuccess(''), 4000);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleToggleProductStatus = async (prod) => {
    try {
      const res = await fetch(`/api/product/${prod.idProducto}/status`, {
        method: 'PUT'
      });
      if (res.ok) {
        reloadProducts();
        setSuccess(`Producto ${prod.activo ? 'desactivado' : 'activado'} correctamente`);
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const data = await res.json();
        setError(data.mensaje || 'Error al cambiar estado del producto');
      }
    } catch (e) {
      setError('Error al conectar con el servidor');
    }
  };

  // Quick Category Submit (from within Product modal)
  const handleQuickCategorySubmit = async (e) => {
    e.preventDefault();
    setQuickCategoryError('');

    if (!quickCategoryName.trim()) {
      setQuickCategoryError('El nombre es obligatorio');
      return;
    }

    try {
      const res = await fetch('/api/category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombreCategoriaProducto: quickCategoryName.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.mensaje || 'Error al crear categoría');
      }

      await reloadCategories();
      
      // Auto select the newly created category
      setProductForm(prev => ({
        ...prev,
        idCategoriaProducto: data.idCategoriaProducto
      }));

      // Reset quick form
      setQuickCategoryName('');
      setShowQuickCategory(false);
    } catch (err) {
      setQuickCategoryError(err.message);
    }
  };

  // Categories Full Manager Submit
  const handleCategorySubmit = async (e) => {
    e.preventDefault();
    setCategoryError('');

    if (!categoryForm.nombreCategoriaProducto.trim()) {
      setCategoryError('El nombre es obligatorio');
      return;
    }

    try {
      let res;
      if (editingCategory) {
        res = await fetch(`/api/category/${editingCategory.idCategoriaProducto}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(categoryForm)
        });
      } else {
        res = await fetch('/api/category', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(categoryForm)
        });
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.mensaje || 'Error al guardar categoría');
      }

      setCategoryForm({ nombreCategoriaProducto: '' });
      setEditingCategory(null);
      reloadCategories();
      reloadProducts(); // Reload products to update category names if edited
    } catch (err) {
      setCategoryError(err.message);
    }
  };

  const handleEditCategoryClick = (cat) => {
    setEditingCategory(cat);
    setCategoryForm({
      nombreCategoriaProducto: cat.nombreCategoriaProducto
    });
  };

  const handleToggleCategoryStatus = async (cat) => {
    try {
      const res = await fetch(`/api/category/${cat.idCategoriaProducto}/status`, {
        method: 'PUT'
      });
      if (res.ok) {
        reloadCategories();
        reloadProducts();
      } else {
        const data = await res.json();
        setCategoryError(data.mensaje || 'Error al cambiar estado');
      }
    } catch (e) {
      setCategoryError('Error al conectar con el servidor');
    }
  };

  // Offer/Discount CRUD
  const handleOpenCreateDiscount = () => {
    setDiscountForm({
      idProducto: '',
      porcentajeDescuento: '',
      fechaInicioDescuento: new Date().toISOString().substring(0, 16), // Local datetime format
      fechaTerminoDescuento: ''
    });
    setError('');
    setSuccess('');
    setShowDiscountModal(true);
  };

  const handleDiscountSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!discountForm.idProducto) {
      setError('Debe seleccionar un producto');
      return;
    }
    const pct = parseFloat(discountForm.porcentajeDescuento);
    if (isNaN(pct) || pct <= 0 || pct > 100) {
      setError('El descuento debe estar entre 1 y 100%');
      return;
    }
    if (!discountForm.fechaInicioDescuento) {
      setError('Debe ingresar la fecha de inicio');
      return;
    }

    const payload = {
      idProducto: parseInt(discountForm.idProducto),
      porcentajeDescuento: pct,
      fechaInicioDescuento: new Date(discountForm.fechaInicioDescuento).toISOString(),
      fechaTerminoDescuento: discountForm.fechaTerminoDescuento ? new Date(discountForm.fechaTerminoDescuento).toISOString() : null
    };

    try {
      const res = await fetch('/api/discount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.mensaje || 'Error al guardar la oferta');
      }

      setSuccess('Oferta creada con éxito');
      setShowDiscountModal(false);
      reloadDiscounts();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleDiscountStatus = async (disc) => {
    try {
      const res = await fetch(`/api/discount/${disc.idDescuentoProducto}/status`, {
        method: 'PUT'
      });
      if (res.ok) {
        reloadDiscounts();
        setSuccess(`Oferta ${disc.activo ? 'desactivada' : 'activada'} correctamente`);
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const data = await res.json();
        setError(data.mensaje || 'Error al cambiar estado de la oferta');
      }
    } catch (e) {
      setError('Error al conectar con el servidor');
    }
  };

  const handleDeleteDiscount = async (disc) => {
    if (!window.confirm('¿Está seguro de eliminar esta oferta permanentemente?')) return;
    try {
      const res = await fetch(`/api/discount/${disc.idDescuentoProducto}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        reloadDiscounts();
        setSuccess('Oferta eliminada correctamente');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const data = await res.json();
        setError(data.mensaje || 'Error al eliminar oferta');
      }
    } catch (e) {
      setError('Error al conectar con el servidor');
    }
  };

  // Helper date formatter
  const formatDateTime = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <div className="animate-fade-in" style={{ width: '100%' }}>
      {/* Header Panel */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '28px'
      }}>
        <div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: '800', margin: 0 }} className="text-gradient">
            Gestión de Inventario
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
            Controla y configura el stock de productos, categorías y ofertas especiales.
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            onClick={() => setShowCategoriesModal(true)}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <FolderPlus size={16} />
            <span>Categorías</span>
          </button>
          
          {activeTab === 'products' ? (
            <button 
              onClick={handleOpenCreateProduct}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Plus size={16} />
              <span>Nuevo Producto</span>
            </button>
          ) : (
            <button 
              onClick={handleOpenCreateDiscount}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Percent size={16} />
              <span>Nueva Oferta</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs Menu */}
      <div style={{
        display: 'flex',
        borderBottom: '2px solid var(--panel-border)',
        marginBottom: '24px',
        gap: '24px'
      }}>
        <button
          onClick={() => setActiveTab('products')}
          style={{
            padding: '12px 4px',
            fontSize: '0.95rem',
            fontWeight: '700',
            background: 'none',
            border: 'none',
            color: activeTab === 'products' ? 'var(--primary-color)' : 'var(--text-muted)',
            borderBottom: activeTab === 'products' ? '3px solid var(--primary-color)' : '3px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Coffee size={18} />
          <span>Productos</span>
        </button>
        <button
          onClick={() => setActiveTab('offers')}
          style={{
            padding: '12px 4px',
            fontSize: '0.95rem',
            fontWeight: '700',
            background: 'none',
            border: 'none',
            color: activeTab === 'offers' ? 'var(--primary-color)' : 'var(--text-muted)',
            borderBottom: activeTab === 'offers' ? '3px solid var(--primary-color)' : '3px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Tag size={18} />
          <span>Ofertas y Descuentos</span>
        </button>
      </div>

      {/* Feedback Alerts */}
      {error && (
        <div className="badge badge-danger" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', borderRadius: '10px', textTransform: 'none', marginBottom: '20px', width: '100%', boxSizing: 'border-box' }}>
          <AlertCircle size={18} />
          <span style={{ fontWeight: '500' }}>{error}</span>
        </div>
      )}
      {success && (
        <div className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', borderRadius: '10px', textTransform: 'none', marginBottom: '20px', width: '100%', boxSizing: 'border-box', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#065f46', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
          <CheckCircle2 size={18} />
          <span style={{ fontWeight: '500' }}>{success}</span>
        </div>
      )}

      {/* Loading Spinner */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '100px 0' }}>
          <div style={{
            border: '4px solid rgba(212, 163, 115, 0.1)',
            width: '50px',
            height: '50px',
            borderRadius: '50%',
            borderLeftColor: 'var(--primary-color)',
            animation: 'spin 1s linear infinite'
          }} />
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        </div>
      ) : activeTab === 'products' ? (
        /* PRODUCTS TAB */
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th style={{ width: '60px' }}>Imagen</th>
                <th style={{ width: '80px' }}>ID</th>
                <th>Producto</th>
                <th>Categoría</th>
                <th>Precio Original</th>
                <th>Receta</th>
                <th>Stock</th>
                <th>Estado</th>
                <th style={{ textAlign: 'right', width: '120px' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
                    No hay productos registrados en el inventario.
                  </td>
                </tr>
              ) : (
                products.map((prod) => (
                  <tr key={prod.idProducto} style={{ opacity: prod.activo ? 1 : 0.65 }}>
                    <td>
                      <div style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '8px',
                        backgroundColor: '#f1f5f9',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid var(--panel-border)',
                        overflow: 'hidden'
                      }}>
                        {prod.imagenBase64 ? (
                          <img 
                            src={`data:image/png;base64,${prod.imagenBase64}`} 
                            alt={prod.nombreProducto} 
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                          />
                        ) : (
                          <Coffee size={20} color="var(--text-muted)" />
                        )}
                      </div>
                    </td>
                    <td style={{ fontWeight: '600', color: 'var(--text-muted)' }}>#{prod.idProducto}</td>
                    <td>
                      <div style={{ fontWeight: '600', color: 'var(--text-main)' }}>
                        {prod.nombreProducto}
                      </div>
                      {prod.descripcionProducto && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {prod.descripcionProducto}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="badge" style={{ fontSize: '0.75rem', backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }}>
                        {prod.nombreCategoriaProducto}
                      </span>
                    </td>
                    <td style={{ fontWeight: '600' }}>
                      ${prod.precio.toLocaleString('es-CL')}
                    </td>
                    <td>
                      {prod.requiereReceta ? (
                        <span className={`badge ${prod.tieneRecetaConfigurada ? 'badge-success' : 'badge-warning'}`}>
                          {prod.tieneRecetaConfigurada ? 'Configurada' : 'Pendiente'}
                        </span>
                      ) : <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>No requiere</span>}
                    </td>
                    <td>
                      {prod.stock !== null ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600', color: prod.stock <= 5 ? '#b91c1c' : 'var(--text-main)' }}>
                          <Package size={14} />
                          <span>{prod.stock}</span>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          Usa Receta
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${prod.activo ? 'badge-success' : 'badge-danger'}`}>
                        {prod.activo ? 'Activo' : 'Desactivado'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                        {prod.requiereReceta && (
                          <button
                            onClick={() => navigate(`/inventory/products/${prod.idProducto}/recipe`)}
                            className="btn btn-primary"
                            style={{ padding: '4px', borderRadius: '6px' }}
                            data-tooltip={prod.tieneRecetaConfigurada ? 'Editar receta' : 'Crear receta'}
                          >
                            <ClipboardList size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenEditProduct(prod)}
                          className="btn btn-secondary"
                          style={{ padding: '4px', borderRadius: '6px' }}
                          data-tooltip="Editar Producto"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleToggleProductStatus(prod)}
                          className={`btn ${prod.activo ? 'btn-danger' : 'btn-primary'}`}
                          style={{ padding: '4px', borderRadius: '6px' }}
                          data-tooltip={prod.activo ? 'Desactivar' : 'Activar'}
                        >
                          {prod.activo ? <Trash2 size={14} /> : <CheckCircle2 size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* OFFERS TAB */
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th style={{ width: '80px' }}>ID</th>
                <th>Producto</th>
                <th>Precio Original</th>
                <th>Descuento</th>
                <th>Precio Oferta</th>
                <th>Vigencia</th>
                <th>Estado</th>
                <th style={{ textAlign: 'right', width: '120px' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {discounts.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
                    No hay ofertas o descuentos vigentes registrados.
                  </td>
                </tr>
              ) : (
                discounts.map((disc) => {
                  const valorDescuento = (disc.precioOriginal * disc.porcentajeDescuento) / 100;
                  const precioOferta = disc.precioOriginal - valorDescuento;
                  return (
                    <tr key={disc.idDescuentoProducto} style={{ opacity: disc.activo ? 1 : 0.65 }}>
                      <td style={{ fontWeight: '600', color: 'var(--text-muted)' }}>#{disc.idDescuentoProducto}</td>
                      <td style={{ fontWeight: '600' }}>{disc.nombreProducto}</td>
                      <td>${disc.precioOriginal.toLocaleString('es-CL')}</td>
                      <td>
                        <span className="badge" style={{ fontWeight: '700', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#b91c1c', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                          -{disc.porcentajeDescuento}%
                        </span>
                      </td>
                      <td style={{ fontWeight: '700', color: '#15803d' }}>
                        ${precioOferta.toLocaleString('es-CL')}
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          <span><strong>Inicio:</strong> {formatDateTime(disc.fechaInicioDescuento)}</span>
                          <span><strong>Fin:</strong> {disc.fechaTerminoDescuento ? formatDateTime(disc.fechaTerminoDescuento) : 'Indefinido'}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${disc.activo ? 'badge-success' : 'badge-danger'}`}>
                          {disc.activo ? 'Vigente' : 'Inactiva'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => handleToggleDiscountStatus(disc)}
                            className={`btn ${disc.activo ? 'btn-secondary' : 'btn-primary'}`}
                            style={{ padding: '4px', borderRadius: '6px' }}
                            data-tooltip={disc.activo ? 'Pausar Oferta' : 'Activar Oferta'}
                          >
                            <Calendar size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteDiscount(disc)}
                            className="btn btn-danger"
                            style={{ padding: '4px', borderRadius: '6px' }}
                            data-tooltip="Eliminar"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL: Crear/Editar Producto */}
      {showProductModal && (
        <div className="modal-overlay">
          {/* CRITICAL: No click-outside close handler to prevent accidental closures */}
          <div className="modal-content" style={{ maxWidth: '540px', position: 'relative', padding: '30px' }}>
            <button 
              type="button" 
              className="btn" 
              style={{ position: 'absolute', right: '20px', top: '20px', padding: '6px', background: 'none' }} 
              onClick={() => setShowProductModal(false)}
            >
              <X size={20} color="var(--text-muted)" />
            </button>
            
            <h3 style={{ fontSize: '1.5rem', marginBottom: '8px', fontWeight: '700' }} className="text-gradient">
              {editingProduct ? 'Editar Producto' : 'Crear Producto'}
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '24px' }}>
              Ingresa los datos del producto para actualizar el catálogo.
            </p>

            <form onSubmit={handleProductSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '28px' }}>
                
                {/* 1. Nombre del Producto (PRIMERO) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-main)' }}>Nombre del Producto *</label>
                  <input
                    type="text"
                    value={productForm.nombreProducto}
                    onChange={(e) => setProductForm(prev => ({ ...prev, nombreProducto: e.target.value }))}
                    style={inputStyle}
                    placeholder="Ej. Café Espresso Doble"
                    maxLength={150}
                    required
                  />
                </div>

                {/* 2. Categoría (SEGUNDO) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-main)' }}>Categoría *</label>
                  <SearchableSelect
                    options={categories.filter(c => c.activo).map(c => ({ value: c.idCategoriaProducto, label: c.nombreCategoriaProducto }))}
                    value={productForm.idCategoriaProducto}
                    onChange={(val) => setProductForm(prev => ({ ...prev, idCategoriaProducto: val }))}
                    placeholder="Buscar y seleccionar categoría..."
                    noOptionsMessage="No hay categorías con ese nombre"
                    customActionButton={
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setShowQuickCategory(true)}
                        style={{ padding: '0 12px', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '10px' }}
                        data-tooltip="Nueva Categoría Rápida"
                      >
                        <Plus size={18} />
                      </button>
                    }
                  />
                </div>

                {/* 3. Precio y Stock Inicial (TERCERO) */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '16px'
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-main)' }}>Precio (CLP) *</label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <span style={{ position: 'absolute', left: '14px', fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: '600', zIndex: 5 }}>$</span>
                      <input
                        type="number"
                        value={productForm.precio}
                        onChange={(e) => setProductForm(prev => ({ ...prev, precio: e.target.value }))}
                        style={{ ...inputStyle, paddingLeft: '28px' }}
                        placeholder="Ej. 2500"
                        min={1}
                        required
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-main)' }}>Stock Inicial (Opcional)</label>
                    <input
                      type="number"
                      value={productForm.stock}
                      onChange={(e) => setProductForm(prev => ({ ...prev, stock: e.target.value }))}
                      style={inputStyle}
                      placeholder="Ej. 50 (Vacío si usa receta)"
                      min={0}
                      disabled={productForm.requiereReceta}
                    />
                  </div>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '12px 14px', border: '1px solid var(--panel-border)', borderRadius: '10px', background: '#f8fafc' }}>
                  <input
                    type="checkbox"
                    checked={productForm.requiereReceta}
                    onChange={(e) => setProductForm(prev => ({ ...prev, requiereReceta: e.target.checked, stock: e.target.checked ? '' : prev.stock }))}
                    style={{ width: '17px', height: '17px', accentColor: 'var(--primary-color)' }}
                  />
                  <span style={{ fontSize: '0.86rem', fontWeight: 600 }}>Este producto requiere receta para su preparación</span>
                </label>

                {/* 4. Imagen del Producto (CUARTO - NEW!) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-main)' }}>Imagen del Producto</label>
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    {/* Upload box */}
                    <label style={{
                      flex: 1,
                      height: '42px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      border: '1.5px dashed var(--panel-border)',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: '600',
                      color: 'var(--text-muted)',
                      backgroundColor: '#f8fafc',
                      transition: 'all 0.2s ease',
                      boxSizing: 'border-box'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--primary-color)'}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--panel-border)'}
                    >
                      <Upload size={16} />
                      <span>Seleccionar Imagen</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleImageChange} 
                        style={{ display: 'none' }} 
                      />
                    </label>

                    {imagePreview && (
                      <button
                        type="button"
                        onClick={handleClearImage}
                        className="btn btn-danger"
                        style={{ padding: '0 12px', height: '42px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        Quitar
                      </button>
                    )}
                  </div>

                  {/* Image Preview Box */}
                  {imagePreview && (
                    <div style={{ 
                      marginTop: '8px', 
                      display: 'flex', 
                      justifyContent: 'center', 
                      alignItems: 'center',
                      padding: '10px',
                      border: '1px solid var(--panel-border)',
                      borderRadius: '12px',
                      backgroundColor: '#f8fafc',
                      height: '120px'
                    }}>
                      <img 
                        src={imagePreview} 
                        alt="Vista Previa" 
                        style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', borderRadius: '6px' }} 
                      />
                    </div>
                  )}
                </div>

                {/* 5. Descripción (QUINTO) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-main)' }}>Descripción</label>
                  <textarea
                    value={productForm.descripcionProducto}
                    onChange={(e) => setProductForm(prev => ({ ...prev, descripcionProducto: e.target.value }))}
                    style={{ ...inputStyle, minHeight: '80px', height: 'auto', resize: 'vertical', padding: '10px 14px' }}
                    placeholder="Breve descripción del producto (ingredientes, tamaño)..."
                    maxLength={300}
                  />
                </div>

              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: '12px', borderRadius: '10px' }}
                  onClick={() => setShowProductModal(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1, padding: '12px', borderRadius: '10px' }}
                >
                  {editingProduct ? 'Actualizar Producto' : 'Crear Producto'}
                </button>
              </div>
            </form>

            {/* QUICK CATEGORY FORM (Sub-overlay inside product modal) */}
            {showQuickCategory && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(255, 255, 255, 0.98)',
                borderRadius: '20px',
                zIndex: 1200,
                padding: '30px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center'
              }}>
                <h4 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '8px', color: 'var(--primary-color)' }}>
                  Añadir Nueva Categoría
                </h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                  Crea una categoría directamente sin perder los datos del producto actual.
                </p>

                {quickCategoryError && (
                  <div className="badge badge-danger" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '6px', textTransform: 'none', marginBottom: '16px' }}>
                    <AlertCircle size={14} />
                    <span>{quickCategoryError}</span>
                  </div>
                )}

                <form onSubmit={handleQuickCategorySubmit}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-main)' }}>Nombre de la Categoría</label>
                      <input
                        type="text"
                        value={quickCategoryName}
                        onChange={(e) => setQuickCategoryName(e.target.value)}
                        style={inputStyle}
                        placeholder="Ej. Café en Grano, Bollería..."
                        maxLength={100}
                        autoFocus
                        required
                      />
                    </div>

                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ flex: 1, padding: '10px', borderRadius: '10px' }}
                      onClick={() => {
                        setShowQuickCategory(false);
                        setQuickCategoryName('');
                        setQuickCategoryError('');
                      }}
                    >
                      Volver
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      style={{ flex: 1, padding: '10px', borderRadius: '10px' }}
                    >
                      Guardar y Seleccionar
                    </button>
                  </div>
                </form>
              </div>
            )}

          </div>
        </div>
      )}

      {/* MODAL: Crear Oferta */}
      {showDiscountModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '460px', padding: '30px' }}>
            <button 
              type="button" 
              className="btn" 
              style={{ position: 'absolute', right: '20px', top: '20px', padding: '6px', background: 'none' }} 
              onClick={() => setShowDiscountModal(false)}
            >
              <X size={20} color="var(--text-muted)" />
            </button>

            <h3 style={{ fontSize: '1.5rem', marginBottom: '8px', fontWeight: '700' }} className="text-gradient">
              Crear Oferta Especial
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '24px' }}>
              Selecciona un producto y define el porcentaje de descuento promocional.
            </p>

            <form onSubmit={handleDiscountSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '28px' }}>
                
                {/* Searchable select product */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-main)' }}>Producto *</label>
                  <SearchableSelect
                    options={products.filter(p => p.activo).map(p => ({ value: p.idProducto, label: `${p.nombreProducto} ($${p.precio.toLocaleString('es-CL')})` }))}
                    value={discountForm.idProducto}
                    onChange={(val) => setDiscountForm(prev => ({ ...prev, idProducto: val }))}
                    placeholder="Buscar y seleccionar producto..."
                    noOptionsMessage="No hay productos disponibles con ese nombre"
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-main)' }}>Porcentaje de Descuento (1-100) *</label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <span style={{ position: 'absolute', left: '14px', fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: '600', zIndex: 5 }}>%</span>
                    <input
                      type="number"
                      value={discountForm.porcentajeDescuento}
                      onChange={(e) => setDiscountForm(prev => ({ ...prev, porcentajeDescuento: e.target.value }))}
                      style={{ ...inputStyle, paddingLeft: '28px' }}
                      placeholder="Ej. 15"
                      min={1}
                      max={100}
                      required
                    />
                  </div>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '16px'
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-main)' }}>Fecha Inicio *</label>
                    <input
                      type="datetime-local"
                      value={discountForm.fechaInicioDescuento}
                      onChange={(e) => setDiscountForm(prev => ({ ...prev, fechaInicioDescuento: e.target.value }))}
                      style={{ ...inputStyle, padding: '8px' }}
                      required
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-main)' }}>Fecha Término (Opcional)</label>
                    <input
                      type="datetime-local"
                      value={discountForm.fechaTerminoDescuento}
                      onChange={(e) => setDiscountForm(prev => ({ ...prev, fechaTerminoDescuento: e.target.value }))}
                      style={{ ...inputStyle, padding: '8px' }}
                    />
                  </div>
                </div>

              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: '12px', borderRadius: '10px' }}
                  onClick={() => setShowDiscountModal(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1, padding: '12px', borderRadius: '10px' }}
                >
                  Crear Oferta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Gestionar Categorías (CRUD simple similar a roles) */}
      {showCategoriesModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '660px', padding: '30px' }}>
            <button 
              type="button" 
              className="btn" 
              style={{ position: 'absolute', right: '20px', top: '20px', padding: '6px', background: 'none' }} 
              onClick={() => {
                setShowCategoriesModal(false);
                setEditingCategory(null);
                        setCategoryForm({ nombreCategoriaProducto: '' });
                setCategoryError('');
              }}
            >
              <X size={20} color="var(--text-muted)" />
            </button>

            <h3 style={{ fontSize: '1.5rem', marginBottom: '8px', fontWeight: '700' }} className="text-gradient">
              Mantenedor de Categorías
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '24px' }}>
              Registra y modifica las categorías de productos de la cafetería.
            </p>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '240px 1fr',
              gap: '24px'
            }}>
              {/* Form Side */}
              <div style={{ borderRight: '1px solid var(--panel-border)', paddingRight: '20px' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: '700', marginBottom: '14px', color: 'var(--primary-color)' }}>
                  {editingCategory ? 'Editar Categoría' : 'Nueva Categoría'}
                </h4>
                
                {categoryError && (
                  <div className="badge badge-danger" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 10px', borderRadius: '6px', textTransform: 'none', marginBottom: '14px', fontSize: '0.78rem' }}>
                    <AlertCircle size={14} />
                    <span>{categoryError}</span>
                  </div>
                )}

                <form onSubmit={handleCategorySubmit}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-main)' }}>Nombre *</label>
                      <input
                        type="text"
                        value={categoryForm.nombreCategoriaProducto}
                        onChange={(e) => setCategoryForm(prev => ({ ...prev, nombreCategoriaProducto: e.target.value }))}
                        style={inputStyle}
                        placeholder="Ej. Bollería"
                        maxLength={100}
                        required
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      style={{ flex: 1, padding: '8px', fontSize: '0.85rem', borderRadius: '8px' }}
                    >
                      {editingCategory ? 'Actualizar' : 'Guardar'}
                    </button>
                    {editingCategory && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '8px', fontSize: '0.85rem', borderRadius: '8px' }}
                        onClick={() => {
                          setEditingCategory(null);
                          setCategoryForm({ nombreCategoriaProducto: '' });
                          setCategoryError('');
                        }}
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </form>
              </div>

              {/* List Side */}
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: '700', marginBottom: '14px', color: 'var(--text-muted)' }}>
                  Categorías Registradas
                </h4>

                <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid var(--panel-border)', borderRadius: '10px' }}>
                  <table className="custom-table" style={{ fontSize: '0.85rem' }}>
                    <thead>
                      <tr>
                        <th>Nombre</th>
                        <th style={{ textAlign: 'right', width: '90px' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categories.length === 0 ? (
                        <tr>
                          <td colSpan="2" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '16px' }}>
                            Sin categorías.
                          </td>
                        </tr>
                      ) : (
                        categories.map((cat) => (
                          <tr key={cat.idCategoriaProducto} style={{ opacity: cat.activo ? 1 : 0.5 }}>
                            <td style={{ fontWeight: '600' }}>{cat.nombreCategoriaProducto}</td>
                            <td>
                              <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                                <button
                                  onClick={() => handleEditCategoryClick(cat)}
                                  className="btn btn-secondary"
                                  style={{ padding: '4px', borderRadius: '4px' }}
                                  disabled={!cat.activo}
                                >
                                  <Edit2 size={12} />
                                </button>
                                <button
                                  onClick={() => handleToggleCategoryStatus(cat)}
                                  className={`btn ${cat.activo ? 'btn-danger' : 'btn-primary'}`}
                                  style={{ padding: '4px', borderRadius: '4px' }}
                                >
                                  {cat.activo ? <Trash2 size={12} /> : <CheckCircle2 size={12} />}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default InventoryManagement;
