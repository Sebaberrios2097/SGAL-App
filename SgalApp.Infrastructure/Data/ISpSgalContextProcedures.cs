using SgalApp.Infrastructure.StoredProcedures;

namespace SgalApp.Infrastructure.Data
{
    public partial interface ISpSgalContextProcedures
    {
        Task<List<sp_Emp_CambiaClaveResult>> sp_Emp_CambiaClaveAsync(int? iDUSUARIO, string pASSACTUAL, string pASSNUEVA, bool? eSADMIN, OutputParameter<int> returnValue = null, CancellationToken cancellationToken = default);
        Task<List<sp_Emp_Crea_UsuarioEmpleadoResult>> sp_Emp_Crea_UsuarioEmpleadoAsync(int? rUT, OutputParameter<int> returnValue = null, CancellationToken cancellationToken = default);
        Task<List<sp_Emp_ValidaAccesoResult>> sp_Emp_ValidaAccesoAsync(int? iDUSUARIO, string pASS, OutputParameter<int> returnValue = null, CancellationToken cancellationToken = default);
    }
}