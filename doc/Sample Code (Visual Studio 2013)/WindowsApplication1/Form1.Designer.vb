<Global.Microsoft.VisualBasic.CompilerServices.DesignerGenerated()> _
Partial Class Form1
    Inherits System.Windows.Forms.Form

    'Form overrides dispose to clean up the component list.
    <System.Diagnostics.DebuggerNonUserCode()> _
    Protected Overrides Sub Dispose(ByVal disposing As Boolean)
        Try
            If disposing AndAlso components IsNot Nothing Then
                components.Dispose()
            End If
        Finally
            MyBase.Dispose(disposing)
        End Try
    End Sub

    'Required by the Windows Form Designer
    Private components As System.ComponentModel.IContainer

    'NOTE: The following procedure is required by the Windows Form Designer
    'It can be modified using the Windows Form Designer.  
    'Do not modify it using the code editor.
    <System.Diagnostics.DebuggerStepThrough()> _
    Private Sub InitializeComponent()
        Me.btnExecuteQry = New System.Windows.Forms.Button()
        Me.Label1 = New System.Windows.Forms.Label()
        Me.btnAddSaleVch = New System.Windows.Forms.Button()
        Me.btnModifySaleVch = New System.Windows.Forms.Button()
        Me.btnModifyByVchCode = New System.Windows.Forms.Button()
        Me.btnAddMaster = New System.Windows.Forms.Button()
        Me.btnModifyMaster = New System.Windows.Forms.Button()
        Me.btnModifyMasterByName = New System.Windows.Forms.Button()
        Me.btnAddJrnlVch = New System.Windows.Forms.Button()
        Me.AddPymt = New System.Windows.Forms.Button()
        Me.AddRcpt = New System.Windows.Forms.Button()
        Me.btnAddSO = New System.Windows.Forms.Button()
        Me.btnGetVchXML = New System.Windows.Forms.Button()
        Me.SuspendLayout()
        '
        'btnExecuteQry
        '
        Me.btnExecuteQry.Location = New System.Drawing.Point(627, 569)
        Me.btnExecuteQry.Margin = New System.Windows.Forms.Padding(6)
        Me.btnExecuteQry.Name = "btnExecuteQry"
        Me.btnExecuteQry.Size = New System.Drawing.Size(182, 36)
        Me.btnExecuteQry.TabIndex = 0
        Me.btnExecuteQry.Text = "Execute Query"
        Me.btnExecuteQry.UseVisualStyleBackColor = True
        '
        'Label1
        '
        Me.Label1.AutoSize = True
        Me.Label1.Location = New System.Drawing.Point(24, 40)
        Me.Label1.Margin = New System.Windows.Forms.Padding(6, 0, 6, 0)
        Me.Label1.Name = "Label1"
        Me.Label1.Size = New System.Drawing.Size(77, 25)
        Me.Label1.TabIndex = 1
        Me.Label1.Text = "Label1"
        '
        'btnAddSaleVch
        '
        Me.btnAddSaleVch.Location = New System.Drawing.Point(627, 56)
        Me.btnAddSaleVch.Margin = New System.Windows.Forms.Padding(6)
        Me.btnAddSaleVch.Name = "btnAddSaleVch"
        Me.btnAddSaleVch.Size = New System.Drawing.Size(212, 36)
        Me.btnAddSaleVch.TabIndex = 2
        Me.btnAddSaleVch.Text = "Add Sale Voucher"
        Me.btnAddSaleVch.UseVisualStyleBackColor = True
        '
        'btnModifySaleVch
        '
        Me.btnModifySaleVch.Location = New System.Drawing.Point(551, 112)
        Me.btnModifySaleVch.Margin = New System.Windows.Forms.Padding(6)
        Me.btnModifySaleVch.Name = "btnModifySaleVch"
        Me.btnModifySaleVch.Size = New System.Drawing.Size(318, 36)
        Me.btnModifySaleVch.TabIndex = 3
        Me.btnModifySaleVch.Text = "Modify Sale Voucher (by Key)"
        Me.btnModifySaleVch.UseVisualStyleBackColor = True
        '
        'btnModifyByVchCode
        '
        Me.btnModifyByVchCode.Location = New System.Drawing.Point(533, 168)
        Me.btnModifyByVchCode.Margin = New System.Windows.Forms.Padding(6)
        Me.btnModifyByVchCode.Name = "btnModifyByVchCode"
        Me.btnModifyByVchCode.Size = New System.Drawing.Size(366, 36)
        Me.btnModifyByVchCode.TabIndex = 4
        Me.btnModifyByVchCode.Text = "Modify Sale Voucher (by VchCode)"
        Me.btnModifyByVchCode.UseVisualStyleBackColor = True
        '
        'btnAddMaster
        '
        Me.btnAddMaster.Location = New System.Drawing.Point(627, 224)
        Me.btnAddMaster.Margin = New System.Windows.Forms.Padding(6)
        Me.btnAddMaster.Name = "btnAddMaster"
        Me.btnAddMaster.Size = New System.Drawing.Size(212, 36)
        Me.btnAddMaster.TabIndex = 5
        Me.btnAddMaster.Text = "Add Master"
        Me.btnAddMaster.UseVisualStyleBackColor = True
        '
        'btnModifyMaster
        '
        Me.btnModifyMaster.Location = New System.Drawing.Point(597, 280)
        Me.btnModifyMaster.Margin = New System.Windows.Forms.Padding(6)
        Me.btnModifyMaster.Name = "btnModifyMaster"
        Me.btnModifyMaster.Size = New System.Drawing.Size(272, 36)
        Me.btnModifyMaster.TabIndex = 6
        Me.btnModifyMaster.Text = "Modify Master (by Code)"
        Me.btnModifyMaster.UseVisualStyleBackColor = True
        '
        'btnModifyMasterByName
        '
        Me.btnModifyMasterByName.Location = New System.Drawing.Point(597, 336)
        Me.btnModifyMasterByName.Margin = New System.Windows.Forms.Padding(6)
        Me.btnModifyMasterByName.Name = "btnModifyMasterByName"
        Me.btnModifyMasterByName.Size = New System.Drawing.Size(272, 36)
        Me.btnModifyMasterByName.TabIndex = 7
        Me.btnModifyMasterByName.Text = "Modify Master (by Name)"
        Me.btnModifyMasterByName.UseVisualStyleBackColor = True
        '
        'btnAddJrnlVch
        '
        Me.btnAddJrnlVch.Location = New System.Drawing.Point(597, 401)
        Me.btnAddJrnlVch.Margin = New System.Windows.Forms.Padding(6)
        Me.btnAddJrnlVch.Name = "btnAddJrnlVch"
        Me.btnAddJrnlVch.Size = New System.Drawing.Size(256, 36)
        Me.btnAddJrnlVch.TabIndex = 8
        Me.btnAddJrnlVch.Text = "Add Journal Voucher"
        Me.btnAddJrnlVch.UseVisualStyleBackColor = True
        '
        'AddPymt
        '
        Me.AddPymt.Location = New System.Drawing.Point(611, 457)
        Me.AddPymt.Margin = New System.Windows.Forms.Padding(6)
        Me.AddPymt.Name = "AddPymt"
        Me.AddPymt.Size = New System.Drawing.Size(242, 36)
        Me.AddPymt.TabIndex = 12
        Me.AddPymt.Text = "Add Payment"
        Me.AddPymt.UseVisualStyleBackColor = True
        '
        'AddRcpt
        '
        Me.AddRcpt.Location = New System.Drawing.Point(611, 513)
        Me.AddRcpt.Margin = New System.Windows.Forms.Padding(6)
        Me.AddRcpt.Name = "AddRcpt"
        Me.AddRcpt.Size = New System.Drawing.Size(242, 36)
        Me.AddRcpt.TabIndex = 13
        Me.AddRcpt.Text = "Add Receipt"
        Me.AddRcpt.UseVisualStyleBackColor = True
        '
        'btnAddSO
        '
        Me.btnAddSO.Location = New System.Drawing.Point(597, 681)
        Me.btnAddSO.Margin = New System.Windows.Forms.Padding(6)
        Me.btnAddSO.Name = "btnAddSO"
        Me.btnAddSO.Size = New System.Drawing.Size(242, 36)
        Me.btnAddSO.TabIndex = 14
        Me.btnAddSO.Text = "Add Sales Order"
        Me.btnAddSO.UseVisualStyleBackColor = True
        '
        'btnGetVchXML
        '
        Me.btnGetVchXML.Location = New System.Drawing.Point(597, 625)
        Me.btnGetVchXML.Margin = New System.Windows.Forms.Padding(6)
        Me.btnGetVchXML.Name = "btnGetVchXML"
        Me.btnGetVchXML.Size = New System.Drawing.Size(242, 36)
        Me.btnGetVchXML.TabIndex = 15
        Me.btnGetVchXML.Text = "Get Vch XML"
        Me.btnGetVchXML.UseVisualStyleBackColor = True
        '
        'Form1
        '
        Me.AutoScaleDimensions = New System.Drawing.SizeF(12.0!, 25.0!)
        Me.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font
        Me.ClientSize = New System.Drawing.Size(1291, 941)
        Me.Controls.Add(Me.btnGetVchXML)
        Me.Controls.Add(Me.btnAddSO)
        Me.Controls.Add(Me.AddRcpt)
        Me.Controls.Add(Me.AddPymt)
        Me.Controls.Add(Me.btnAddJrnlVch)
        Me.Controls.Add(Me.btnModifyMasterByName)
        Me.Controls.Add(Me.btnModifyMaster)
        Me.Controls.Add(Me.btnAddMaster)
        Me.Controls.Add(Me.btnModifyByVchCode)
        Me.Controls.Add(Me.btnModifySaleVch)
        Me.Controls.Add(Me.btnAddSaleVch)
        Me.Controls.Add(Me.Label1)
        Me.Controls.Add(Me.btnExecuteQry)
        Me.Margin = New System.Windows.Forms.Padding(6)
        Me.Name = "Form1"
        Me.Text = "Form1"
        Me.ResumeLayout(False)
        Me.PerformLayout()

    End Sub
    Friend WithEvents btnExecuteQry As System.Windows.Forms.Button
    Friend WithEvents Label1 As System.Windows.Forms.Label
    Friend WithEvents btnAddSaleVch As System.Windows.Forms.Button
    Friend WithEvents btnModifySaleVch As System.Windows.Forms.Button
    Friend WithEvents btnModifyByVchCode As System.Windows.Forms.Button
    Friend WithEvents btnAddMaster As System.Windows.Forms.Button
    Friend WithEvents btnModifyMaster As System.Windows.Forms.Button
    Friend WithEvents btnModifyMasterByName As System.Windows.Forms.Button
    Friend WithEvents btnAddJrnlVch As System.Windows.Forms.Button
    Friend WithEvents AddPymt As System.Windows.Forms.Button
    Friend WithEvents AddRcpt As System.Windows.Forms.Button
    Friend WithEvents btnAddSO As System.Windows.Forms.Button
    Friend WithEvents btnGetVchXML As System.Windows.Forms.Button

End Class
