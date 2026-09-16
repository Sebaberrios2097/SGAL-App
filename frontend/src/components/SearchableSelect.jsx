import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, Plus } from 'lucide-react';

const SearchableSelect = ({
  options = [],
  value = '',
  onChange = () => {},
  placeholder = 'Seleccionar...',
  noOptionsMessage = 'No se encontraron resultados',
  disabled = false,
  customActionButton = null
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => String(opt.value) === String(value));

  const filteredOptions = options.filter(opt =>
    opt.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelect = (optionValue) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
      <div 
        ref={containerRef} 
        style={{ 
          position: 'relative', 
          flex: 1 
        }}
      >
        {/* Trigger Button */}
        <div
          onClick={() => !disabled && setIsOpen(!isOpen)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            background: disabled ? '#f8fafc' : '#ffffff',
            border: '1px solid var(--panel-border)',
            borderRadius: '10px',
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontSize: '0.9rem',
            color: selectedOption ? 'var(--text-main)' : 'var(--text-muted)',
            fontWeight: selectedOption ? '500' : '400',
            userSelect: 'none',
            transition: 'border-color 0.2s ease',
            height: '42px',
            boxSizing: 'border-box'
          }}
        >
          <span style={{
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronDown 
            size={16} 
            color="var(--text-muted)" 
            style={{ 
              transform: isOpen ? 'rotate(180deg)' : 'none', 
              transition: 'transform 0.2s ease' 
            }} 
          />
        </div>

        {/* Dropdown Menu */}
        {isOpen && (
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: '#ffffff',
            border: '1px solid var(--panel-border)',
            borderRadius: '12px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
            zIndex: 1100,
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            {/* Search Input */}
            <div style={{ 
              position: 'relative',
              display: 'flex',
              alignItems: 'center'
            }}>
              <Search 
                size={14} 
                color="var(--text-muted)" 
                style={{ 
                  position: 'absolute', 
                  left: '12px' 
                }} 
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar..."
                autoFocus
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 34px',
                  border: '1px solid var(--panel-border)',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Options List */}
            <div style={{
              maxHeight: '200px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column'
            }}>
              {filteredOptions.length === 0 ? (
                <div style={{
                  padding: '12px',
                  fontSize: '0.85rem',
                  color: 'var(--text-muted)',
                  textAlign: 'center'
                }}>
                  {noOptionsMessage}
                </div>
              ) : (
                filteredOptions.map((opt) => {
                  const isSelected = String(opt.value) === String(value);
                  return (
                    <div
                      key={opt.value}
                      onClick={() => handleSelect(opt.value)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '6px',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        background: isSelected ? 'rgba(var(--primary-rgb), 0.05)' : 'transparent',
                        color: isSelected ? 'var(--primary-color)' : 'var(--text-main)',
                        fontWeight: isSelected ? '600' : '400',
                        transition: 'background-color 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.backgroundColor = '#f8fafc';
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      {opt.label}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Dynamic Action Button next to select */}
      {customActionButton}
    </div>
  );
};

export default SearchableSelect;
