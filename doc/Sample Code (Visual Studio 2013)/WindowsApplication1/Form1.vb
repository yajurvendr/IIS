
Imports System.Net
Imports System.IO
Imports System.Text
Public Class Form1

    Private m_UseName As String = "Busy" '"Busy" '"q" '"bureau" '"rachna"
    Private m_Pwd As String = "Busy" '"Busy" '"q" '"bureau21" '"rachna"

    Private Sub btnExecuteQry_Click(sender As Object, e As EventArgs) Handles btnExecuteQry.Click
        Dim WinHTTP As HttpWebRequest
        Dim res As HttpWebResponse
        Dim UrlStr As String
        Dim Qry As String
        Dim RetVal As String = ""
        Dim ReturnedHTML As String = ""
        Dim sbSource As StringBuilder
        Dim reader As StreamReader
        Dim QryXML As String
        Dim QryResult As String



        UrlStr = "http://localhost:985"
        '    UrlStr = "http://192.168.0.32:981"

        WinHTTP = WebRequest.Create(UrlStr)

        WinHTTP.Method = "GET"

        'Get All SALE Vchs 
        Qry = "Select * from Tran1 where VchType=9"

        Dim myWebHeaderCollection As New WebHeaderCollection

        myWebHeaderCollection.Add("SC", "1")    'Executes Query and return the resultant Recordset XML
        myWebHeaderCollection.Add("Qry", Qry)
        myWebHeaderCollection.Add("UserName", m_UseName)
        myWebHeaderCollection.Add("Pwd", m_Pwd)

        WinHTTP.Headers = myWebHeaderCollection

        res = WinHTTP.GetResponse

        ' Get the stream associated with the response. 
        reader = New StreamReader(res.GetResponseStream())

        sbSource = New StringBuilder(reader.ReadToEnd())

        ReturnedHTML = sbSource.ToString()

        QryXML = ReturnedHTML

        QryResult = res.GetResponseHeader("Result")
        If QryResult = "T" Then
            Label1.Text = "Result - " & res.GetResponseHeader("Result")
            Label1.Text = Label1.Text & vbCrLf & "Data - " & res.GetResponseHeader("Content-Length")
        Else
            Label1.Text = "Result - " & res.GetResponseHeader("Result")
            Label1.Text = Label1.Text & vbCrLf & "Err Desc - " & res.GetResponseHeader("Description")
        End If

        WinHTTP = Nothing

    End Sub

    Private Sub btnAddSaleVch_Click(sender As Object, e As EventArgs) Handles btnAddSaleVch.Click
        Dim WinHTTP As HttpWebRequest
        Dim res As HttpWebResponse
        Dim UrlStr As String
        Dim XMLStr As String
        Dim RetVal As String = ""
        Dim ReturnedHTML As String = ""
        Dim sbSource As StringBuilder
        Dim reader As StreamReader
        Dim QryXML As String
        Dim QryResult As String



        UrlStr = "http://localhost:985"
        '    UrlStr = "http://192.168.0.32:981"

        WinHTTP = WebRequest.Create(UrlStr)

        WinHTTP.Method = "GET"

        XMLStr = "<Sale>"
        XMLStr = XMLStr & "<VchSeriesName>Main</VchSeriesName><Date>01-04-2023</Date><VchType>9</VchType><VchNo>1</VchNo><STPTName>Local-ItemWise</STPTName><MasterName1>Busy Infotech Pvt. Ltd.</MasterName1><MasterName2>Main Store</MasterName2>"

        XMLStr = XMLStr & "<VchOtherInfoDetails><Narration1>Sample Narration</Narration1></VchOtherInfoDetails>"

        XMLStr = XMLStr & "<ItemEntries>"
        XMLStr = XMLStr & "<ItemDetail><SrNo>1</SrNo><ItemName>Item 1</ItemName><UnitName>Pcs.</UnitName><Qty>1</Qty><Price>1000</Price><Amt>1120</Amt><STAmount>120</STAmount><STPercent>6</STPercent><STPercent1>6</STPercent1><TaxBeforeSurcharge>60</TaxBeforeSurcharge><TaxBeforeSurcharge1>60</TaxBeforeSurcharge1><MC>Main Store</MC></ItemDetail>"
        XMLStr = XMLStr & "<ItemDetail><SrNo>2</SrNo><ItemName>Item 2</ItemName><UnitName>Kgs.</UnitName><Qty>1</Qty><Price>1000</Price><Amt>1180</Amt><STAmount>180</STAmount><STPercent>9</STPercent><STPercent1>9</STPercent1><TaxBeforeSurcharge>90</TaxBeforeSurcharge><TaxBeforeSurcharge1>90</TaxBeforeSurcharge1><MC>Main Store</MC></ItemDetail>"
        XMLStr = XMLStr & "<ItemDetail><SrNo>3</SrNo><ItemName>Item 3</ItemName><UnitName>Dozen</UnitName><Qty>1</Qty><Price>1000</Price><Amt>1000</Amt><Exempted>True</Exempted><MC>Main Store</MC></ItemDetail>"
        XMLStr = XMLStr & "</ItemEntries>"

        XMLStr = XMLStr & "<BillSundries>"
        XMLStr = XMLStr & "<BSDetail><SrNo>1</SrNo><BSName>Discount</BSName><PercentVal>10</PercentVal><Amt>330</Amt></BSDetail>"
        XMLStr = XMLStr & "<BSDetail><SrNo>2</SrNo><BSName>Freight &amp; Forwarding Charges</BSName><Amt>100</Amt></BSDetail>"
        XMLStr = XMLStr & "</BillSundries>"

        XMLStr = XMLStr & "</Sale>"


        Dim myWebHeaderCollection As New WebHeaderCollection
        myWebHeaderCollection.Add("SC", "2")    'Add a voucher
        myWebHeaderCollection.Add("VchType", "9")   'for SALE VchType=9
        myWebHeaderCollection.Add("VchXML", XMLStr)
        myWebHeaderCollection.Add("UserName", m_UseName)
        myWebHeaderCollection.Add("Pwd", m_Pwd)

        WinHTTP.Headers = myWebHeaderCollection

        res = WinHTTP.GetResponse

        ' Get the stream associated with the response. 
        reader = New StreamReader(res.GetResponseStream())

        sbSource = New StringBuilder(reader.ReadToEnd())

        ReturnedHTML = sbSource.ToString()

        QryResult = res.GetResponseHeader("Result")
        If QryResult = "T" Then
            Label1.Text = "Result - " & res.GetResponseHeader("Result")
            Label1.Text = Label1.Text & vbCrLf & "VchCode generated is - " & ReturnedHTML
        Else
            Label1.Text = "Result - " & res.GetResponseHeader("Result")
            Label1.Text = Label1.Text & vbCrLf & "Err Desc - " & res.GetResponseHeader("Description")
        End If

        WinHTTP = Nothing

    End Sub

    Private Sub btnModifySaleVch_Click(sender As Object, e As EventArgs) Handles btnModifySaleVch.Click
        Dim WinHTTP As HttpWebRequest
        Dim res As HttpWebResponse
        Dim UrlStr As String
        Dim XMLStr As String
        Dim RetVal As String = ""
        Dim ReturnedHTML As String = ""
        Dim sbSource As StringBuilder
        Dim reader As StreamReader
        Dim QryXML As String
        Dim QryResult As String



        UrlStr = "http://localhost:985"
        '    UrlStr = "http://192.168.0.32:981"

        WinHTTP = WebRequest.Create(UrlStr)

        WinHTTP.Method = "GET"

        'To Modify change date of Vch
        'XMLStr = "<Sale>"
        'XMLStr = XMLStr & "<VchSeriesName>Main</VchSeriesName><Date>01-04-2023</Date><VchType>9</VchType><VchNo>1</VchNo><STPTName>Local-ItemWise</STPTName><MasterName1>Busy Infotech Pvt. Ltd.</MasterName1><MasterName2>Main Store</MasterName2>"
        'XMLStr = XMLStr & "<VchOtherInfoDetails><Narration1>Sample Narration</Narration1></VchOtherInfoDetails>"

        'XMLStr = XMLStr & "<ItemEntries>"
        'XMLStr = XMLStr & "<ItemDetail><SrNo>1</SrNo><ItemName>Item 1</ItemName><UnitName>Pcs.</UnitName><Qty>1</Qty><Price>1000</Price><Amt>1120</Amt><STAmount>120</STAmount><STPercent>6</STPercent><STPercent1>6</STPercent1><TaxBeforeSurcharge>60</TaxBeforeSurcharge><TaxBeforeSurcharge1>60</TaxBeforeSurcharge1><MC>Main Store</MC></ItemDetail>"
        'XMLStr = XMLStr & "<ItemDetail><SrNo>2</SrNo><ItemName>Item 2</ItemName><UnitName>Kgs.</UnitName><Qty>1</Qty><Price>1000</Price><Amt>1180</Amt><STAmount>180</STAmount><STPercent>9</STPercent><STPercent1>9</STPercent1><TaxBeforeSurcharge>90</TaxBeforeSurcharge><TaxBeforeSurcharge1>90</TaxBeforeSurcharge1><MC>Main Store</MC></ItemDetail>"
        'XMLStr = XMLStr & "<ItemDetail><SrNo>3</SrNo><ItemName>Item 3</ItemName><UnitName>Dozen</UnitName><Qty>1</Qty><Price>1000</Price><Amt>1000</Amt><Exempted>True</Exempted><MC>Main Store</MC></ItemDetail>"
        'XMLStr = XMLStr & "</ItemEntries>"

        'XMLStr = XMLStr & "<BillSundries>"
        'XMLStr = XMLStr & "<BSDetail><SrNo>1</SrNo><BSName>Discount</BSName><PercentVal>10</PercentVal><Amt>330</Amt></BSDetail>"
        'XMLStr = XMLStr & "<BSDetail><SrNo>2</SrNo><BSName>Freight &amp; Forwarding Charges</BSName><Amt>100</Amt></BSDetail>"
        'XMLStr = XMLStr & "</BillSundries>"
        'XMLStr = XMLStr & "</Sale>"
        XMLStr = "<Sale>"
        XMLStr = XMLStr & "<VchSeriesName>Main</VchSeriesName>"
        XMLStr = XMLStr & "<Date>01-04-2023</Date><VchType>9</VchType>"
        XMLStr = XMLStr & "<StockUpdationDate>01-04-2023</StockUpdationDate><VchNo>2/2022-23</VchNo><AutoVchNo>1</AutoVchNo><STPTName>Central-ItemWise</STPTName>"
        XMLStr = XMLStr & "<MasterName1>Customer-Amit Gupta</MasterName1><MasterName2>Main Store</MasterName2><TranCurName>Rs.</TranCurName><InputType>1</InputType>"
        XMLStr = XMLStr & "<BillingDetails><PartyName>Customer-Amit Gupta</PartyName><Address1>New Delhi</Address1><Address2>India</Address2><MobileNo>9992229989</MobileNo></BillingDetails>"
        XMLStr = XMLStr & "<VchOtherInfoDetails><OFInfo><OF1>DEFG</OF1></OFInfo><Transport>Santosh Transport &amp Company</Transport><GRNo>12</GRNo><VehicleNo>DL10CD2222</VehicleNo><Station>Dadri</Station>"
        XMLStr = XMLStr & "<PurchaseBillNo>2/2022-23</PurchaseBillNo><PurchaseBillDate>01-04-2023</PurchaseBillDate><Narration1>Sale by Salesman1</Narration1><GrDate>01-04-2023</GrDate></VchOtherInfoDetails>"
        XMLStr = XMLStr & "<ItemEntries>"
        XMLStr = XMLStr & "<ItemDetail><VchNo>2/2022-23</VchNo><SrNo>1</SrNo><ItemName>Acer Laptop</ItemName><UnitName>Pcs.</UnitName>"
        XMLStr = XMLStr & "<AltUnitName>Pcs.</AltUnitName><ConFactor>1</ConFactor><Qty>1</Qty><QtyMainUnit>1</QtyMainUnit><QtyAltUnit>1</QtyAltUnit><ItemTaxCategory>&lt&lt---None---&gt&gt</ItemTaxCategory>"
        XMLStr = XMLStr & "<ItemDescInfo /><Price>19600</Price><PriceAltUnit>19600</PriceAltUnit><ListPrice>20000</ListPrice><Amt>21364</Amt><NettAmount>19172.72</NettAmount><Discount>400</Discount><DiscountPercent>2</DiscountPercent>"
        XMLStr = XMLStr & "<CompoundDiscount>2.00</CompoundDiscount><STAmount>1764</STAmount><STPercent>9</STPercent><TaxBeforeSurcharge>1764</TaxBeforeSurcharge><ItemMRP>25000</ItemMRP>"
        XMLStr = XMLStr & "<MC>Main Store</MC><ItemSerialNoEntries /><ParamStockEntries /><BatchEntries /><DiscountStructure>Simple Discount, % of Price</DiscountStructure>"
        XMLStr = XMLStr & "</ItemDetail>"
        XMLStr = XMLStr & "<ItemDetail><Date>01-04-2023</Date><VchType>9</VchType><VchNo>2/2022-23</VchNo><SrNo>2</SrNo><ItemName>Lenovo</ItemName>"
        XMLStr = XMLStr & "<UnitName>Pcs.</UnitName><AltUnitName>Pcs.</AltUnitName><ConFactor>1</ConFactor><Qty>1</Qty><QtyMainUnit>1</QtyMainUnit><QtyAltUnit>1</QtyAltUnit>"
        XMLStr = XMLStr & "<ItemTaxCategory>&lt&lt---None---&gt&gt</ItemTaxCategory><ItemDescInfo /><Price>24250</Price><PriceAltUnit>24250</PriceAltUnit>"
        XMLStr = XMLStr & "<ListPrice>25000</ListPrice><Amt>26432.5</Amt><NettAmount>23721.35</NettAmount><Discount>750</Discount><DiscountPercent>3</DiscountPercent>"
        XMLStr = XMLStr & "<CompoundDiscount>3.00</CompoundDiscount><STAmount>2182.5</STAmount><STPercent>9</STPercent><TaxBeforeSurcharge>2182.5</TaxBeforeSurcharge>"
        XMLStr = XMLStr & "<ItemMRP>30000</ItemMRP><MC>Main Store</MC><ItemSerialNoEntries /><ParamStockEntries /><BatchEntries /><DiscountStructure>Simple Discount, % of Price</DiscountStructure></ItemDetail>"
        XMLStr = XMLStr & "</ItemEntries>"
        XMLStr = XMLStr & "<BillSundries><BSDetail><SrNo>1</SrNo><BSName>Discount</BSName><PercentVal>2</PercentVal><PercentOperatedOn>47796.5</PercentOperatedOn><Amt>955.93</Amt>"
        XMLStr = XMLStr & "<Date>01-04-2023</Date><VchNo>2/2022-23</VchNo><VchType>9</VchType></BSDetail></BillSundries>"
        XMLStr = XMLStr & "<PendingBillDetails><BillDetail><MasterName1>Customer-Amit Gupta</MasterName1><BillRefs><Method>1</Method><SrNo>1</SrNo><RefNo>2/2022-23</RefNo>"
        XMLStr = XMLStr & "<Date>01-04-2023</Date><DueDate>01-04-2023</DueDate><Value1>-46840.57</Value1><VchType>9</VchType>"
        XMLStr = XMLStr & "<MfgDate>01-04-2023</MfgDate></BillRefs></BillDetail></PendingBillDetails>"
        XMLStr = XMLStr & "</Sale>"

        Dim myWebHeaderCollection As New WebHeaderCollection

        myWebHeaderCollection.Add("SC", "3")    'Modify Vch By Key
        myWebHeaderCollection.Add("VchType", "9")   'for SALE VchType=9
        myWebHeaderCollection.Add("VchXML", XMLStr)
        myWebHeaderCollection.Add("ModifyKey", "3") 'ModifyKey = 3 = VchNo + Series + Date
        myWebHeaderCollection.Add("UserName", m_UseName)
        myWebHeaderCollection.Add("Pwd", m_Pwd)

        WinHTTP.Headers = myWebHeaderCollection

        res = WinHTTP.GetResponse

        ' Get the stream associated with the response. 
        reader = New StreamReader(res.GetResponseStream())

        sbSource = New StringBuilder(reader.ReadToEnd())

        ReturnedHTML = sbSource.ToString()

        QryResult = res.GetResponseHeader("Result")
        If QryResult = "T" Then
            Label1.Text = "Result - " & res.GetResponseHeader("Result")
        Else
            Label1.Text = "Result - " & res.GetResponseHeader("Result")
            Label1.Text = Label1.Text & vbCrLf & "Err Desc - " & res.GetResponseHeader("Description")
        End If

        WinHTTP = Nothing

    End Sub

    Private Sub btnModifyByVchCode_Click(sender As Object, e As EventArgs) Handles btnModifyByVchCode.Click
        Dim WinHTTP As HttpWebRequest
        Dim res As HttpWebResponse
        Dim UrlStr As String
        Dim XMLStr As String
        Dim RetVal As String = ""
        Dim ReturnedHTML As String = ""
        Dim sbSource As StringBuilder
        Dim reader As StreamReader
        Dim QryXML As String
        Dim QryResult As String



        UrlStr = "http://localhost:985"
        '    UrlStr = "http://192.168.0.32:981"

        WinHTTP = WebRequest.Create(UrlStr)

        WinHTTP.Method = "GET"

        'To Modify change date of Vch
        XMLStr = "<Sale>"
        XMLStr = XMLStr & "<VchSeriesName>Main</VchSeriesName><Date>01-04-2023</Date><VchType>9</VchType><VchNo>1</VchNo><STPTName>Local-ItemWise</STPTName><MasterName1>Busy Infotech Pvt. Ltd.</MasterName1><MasterName2>Main Store</MasterName2>"
        XMLStr = XMLStr & "<VchOtherInfoDetails><Narration1>Sample Narration</Narration1></VchOtherInfoDetails>"

        XMLStr = XMLStr & "<ItemEntries>"
        XMLStr = XMLStr & "<ItemDetail><SrNo>1</SrNo><ItemName>Item 1</ItemName><UnitName>Pcs.</UnitName><Qty>1</Qty><Price>1000</Price><Amt>1120</Amt><STAmount>120</STAmount><STPercent>6</STPercent><STPercent1>6</STPercent1><TaxBeforeSurcharge>60</TaxBeforeSurcharge><TaxBeforeSurcharge1>60</TaxBeforeSurcharge1><MC>Main Store</MC></ItemDetail>"
        XMLStr = XMLStr & "<ItemDetail><SrNo>2</SrNo><ItemName>Item 2</ItemName><UnitName>Kgs.</UnitName><Qty>1</Qty><Price>1000</Price><Amt>1180</Amt><STAmount>180</STAmount><STPercent>9</STPercent><STPercent1>9</STPercent1><TaxBeforeSurcharge>90</TaxBeforeSurcharge><TaxBeforeSurcharge1>90</TaxBeforeSurcharge1><MC>Main Store</MC></ItemDetail>"
        XMLStr = XMLStr & "<ItemDetail><SrNo>3</SrNo><ItemName>Item 3</ItemName><UnitName>Dozen</UnitName><Qty>1</Qty><Price>1000</Price><Amt>1000</Amt><Exempted>True</Exempted><MC>Main Store</MC></ItemDetail>"
        XMLStr = XMLStr & "</ItemEntries>"

        XMLStr = XMLStr & "<BillSundries>"
        XMLStr = XMLStr & "<BSDetail><SrNo>1</SrNo><BSName>Discount</BSName><PercentVal>10</PercentVal><Amt>330</Amt></BSDetail>"
        XMLStr = XMLStr & "<BSDetail><SrNo>2</SrNo><BSName>Freight &amp; Forwarding Charges</BSName><Amt>100</Amt></BSDetail>"
        XMLStr = XMLStr & "</BillSundries>"
        XMLStr = XMLStr & "</Sale>"

        Dim myWebHeaderCollection As New WebHeaderCollection

        myWebHeaderCollection.Add("SC", "4")    'Modify Vch By VchCode
        myWebHeaderCollection.Add("VchType", "9")   'for SALE VchType=9
        myWebHeaderCollection.Add("VchXML", XMLStr)
        myWebHeaderCollection.Add("VchCode", "2")
        myWebHeaderCollection.Add("UserName", m_UseName)
        myWebHeaderCollection.Add("Pwd", m_Pwd)

        WinHTTP.Headers = myWebHeaderCollection

        res = WinHTTP.GetResponse

        ' Get the stream associated with the response. 
        reader = New StreamReader(res.GetResponseStream())

        sbSource = New StringBuilder(reader.ReadToEnd())

        ReturnedHTML = sbSource.ToString()

        QryResult = res.GetResponseHeader("Result")
        If QryResult = "T" Then
            Label1.Text = "Result - " & res.GetResponseHeader("Result")
        Else
            Label1.Text = "Result - " & res.GetResponseHeader("Result")
            Label1.Text = Label1.Text & vbCrLf & "Err Desc - " & res.GetResponseHeader("Description")
        End If

        WinHTTP = Nothing

    End Sub

    Private Sub btnAddMaster_Click(sender As Object, e As EventArgs) Handles btnAddMaster.Click
        Dim WinHTTP As HttpWebRequest
        Dim res As HttpWebResponse
        Dim UrlStr As String
        Dim XMLStr As String
        Dim RetVal As String = ""
        Dim ReturnedHTML As String = ""
        Dim sbSource As StringBuilder
        Dim reader As StreamReader
        Dim QryXML As String
        Dim QryResult As String



        UrlStr = "http://localhost:985"
        '    UrlStr = "http://192.168.0.32:981"

        WinHTTP = WebRequest.Create(UrlStr)

        WinHTTP.Method = "GET"

        'Account Master with only Mandatory Fields
        XMLStr = "<Account><Name>Acc1</Name><ParentGroup>Sundry Creditors</ParentGroup></Account>"

        Dim myWebHeaderCollection As New WebHeaderCollection

        myWebHeaderCollection.Add("SC", "5")    'Adds a New Master
        myWebHeaderCollection.Add("MasterType", "2")   'for Account Master, MasterType=2
        myWebHeaderCollection.Add("MasterXML", XMLStr)
        myWebHeaderCollection.Add("UserName", m_UseName)
        myWebHeaderCollection.Add("Pwd", m_Pwd)

        WinHTTP.Headers = myWebHeaderCollection

        res = WinHTTP.GetResponse

        ' Get the stream associated with the response. 
        reader = New StreamReader(res.GetResponseStream())

        sbSource = New StringBuilder(reader.ReadToEnd())

        ReturnedHTML = sbSource.ToString()

        QryResult = res.GetResponseHeader("Result")
        If QryResult = "T" Then
            Label1.Text = "Result - " & res.GetResponseHeader("Result")
        Else
            Label1.Text = "Result - " & res.GetResponseHeader("Result")
            Label1.Text = Label1.Text & vbCrLf & "Err Desc - " & res.GetResponseHeader("Description")
        End If

        WinHTTP = Nothing

    End Sub

    Private Sub btnModifyMaster_Click(sender As Object, e As EventArgs) Handles btnModifyMaster.Click
        Dim WinHTTP As HttpWebRequest
        Dim res As HttpWebResponse
        Dim UrlStr As String
        Dim XMLStr As String
        Dim RetVal As String = ""
        Dim ReturnedHTML As String = ""
        Dim sbSource As StringBuilder
        Dim reader As StreamReader
        Dim QryXML As String
        Dim QryResult As String



        UrlStr = "http://localhost:985"
        '    UrlStr = "http://192.168.0.32:981"

        WinHTTP = WebRequest.Create(UrlStr)

        WinHTTP.Method = "GET"

        'Modify Address Details in Account Master
        XMLStr = "<Account><Name>Acc1</Name><ParentGroup>Sundry Creditors</ParentGroup></Account>"
        XMLStr = XMLStr & "<Address>"
        XMLStr = XMLStr & "<Address1>Add1</Address1><Address2>Add2</Address2><Address3>Add3</Address3><Address4>Add4</Address4><TelNo>01127371780</TelNo><Fax>123456789</Fax><Email>rachna.sapra@busy.in</Email>"
        XMLStr = XMLStr & "<GSTNo>GSTNo</GSTNo><Mobile>1234567890</Mobile><ITPAN>ABC123</ITPAN><TINNo>ABC123</TINNo><OF><OF0>A</OF0><OF1>B</OF1><OF2>C</OF2></OF><CountryCode>1141</CountryCode><StateCode>302</StateCode><RegionCode>304</RegionCode>"
        XMLStr = XMLStr & "</Address>"

        Dim myWebHeaderCollection As New WebHeaderCollection

        myWebHeaderCollection.Add("SC", "6")    'Modify a Master through XML string (by its Code)
        myWebHeaderCollection.Add("MasterCode", "1026")   'Specify Master Code that is to be modified
        myWebHeaderCollection.Add("MasterXML", XMLStr)
        myWebHeaderCollection.Add("UserName", m_UseName)
        myWebHeaderCollection.Add("Pwd", m_Pwd)

        WinHTTP.Headers = myWebHeaderCollection

        res = WinHTTP.GetResponse

        ' Get the stream associated with the response. 
        reader = New StreamReader(res.GetResponseStream())

        sbSource = New StringBuilder(reader.ReadToEnd())

        ReturnedHTML = sbSource.ToString()

        QryResult = res.GetResponseHeader("Result")
        If QryResult = "T" Then
            Label1.Text = "Result - " & res.GetResponseHeader("Result")
        Else
            Label1.Text = "Result - " & res.GetResponseHeader("Result")
            Label1.Text = Label1.Text & vbCrLf & "Err Desc - " & res.GetResponseHeader("Description")
        End If

        WinHTTP = Nothing

    End Sub

    Private Sub btnModifyMasterByName_Click(sender As Object, e As EventArgs) Handles btnModifyMasterByName.Click
        Dim WinHTTP As HttpWebRequest
        Dim res As HttpWebResponse
        Dim UrlStr As String
        Dim XMLStr As String
        Dim RetVal As String = ""
        Dim ReturnedHTML As String = ""
        Dim sbSource As StringBuilder
        Dim reader As StreamReader
        Dim QryXML As String
        Dim QryResult As String



        UrlStr = "http://localhost:985"
        '    UrlStr = "http://192.168.0.32:981"

        WinHTTP = WebRequest.Create(UrlStr)

        WinHTTP.Method = "GET"

        'Modify Address Details in Account Master
        XMLStr = "<Account><Name>Acc1</Name><ParentGroup>Sundry Creditors</ParentGroup></Account>"
        XMLStr = XMLStr & "<Address>"
        XMLStr = XMLStr & "<Address1>Add1</Address1><Address2>Add2</Address2><Address3>Add3</Address3><Address4>Add4</Address4><TelNo>01127371780</TelNo><Fax>123456789</Fax><Email>rachna.sapra@busy.in</Email>"
        XMLStr = XMLStr & "<GSTNo>GSTNo</GSTNo><Mobile>1234567890</Mobile><ITPAN>ABC123</ITPAN><TINNo>ABC123</TINNo><OF><OF0>A</OF0><OF1>B</OF1><OF2>C</OF2></OF><CountryCode>1141</CountryCode><StateCode>302</StateCode><RegionCode>304</RegionCode>"
        XMLStr = XMLStr & "</Address>"

        Dim myWebHeaderCollection As New WebHeaderCollection

        myWebHeaderCollection.Add("SC", "7") 'Modify a master through XML string (by its Name)
        myWebHeaderCollection.Add("MasterName", "Acc1")   'Specify Master Code that is to be modified
        myWebHeaderCollection.Add("MasterXML", XMLStr)
        myWebHeaderCollection.Add("MasterType", "2")    'For Account Master, MasterType=2
        myWebHeaderCollection.Add("UserName", m_UseName)
        myWebHeaderCollection.Add("Pwd", m_Pwd)

        WinHTTP.Headers = myWebHeaderCollection

        res = WinHTTP.GetResponse

        ' Get the stream associated with the response. 
        reader = New StreamReader(res.GetResponseStream())

        sbSource = New StringBuilder(reader.ReadToEnd())

        ReturnedHTML = sbSource.ToString()

        QryResult = res.GetResponseHeader("Result")
        If QryResult = "T" Then
            Label1.Text = "Result - " & res.GetResponseHeader("Result")
        Else
            Label1.Text = "Result - " & res.GetResponseHeader("Result")
            Label1.Text = Label1.Text & vbCrLf & "Err Desc - " & res.GetResponseHeader("Description")
        End If

        WinHTTP = Nothing

    End Sub

    Private Sub btnAddJrnlVch_Click(sender As Object, e As EventArgs) Handles btnAddJrnlVch.Click
        Dim WinHTTP As HttpWebRequest
        Dim res As HttpWebResponse
        Dim UrlStr As String
        Dim XMLStr As String
        Dim RetVal As String = ""
        Dim ReturnedHTML As String = ""
        Dim sbSource As StringBuilder
        Dim reader As StreamReader
        Dim QryXML As String
        Dim QryResult As String



        UrlStr = "http://localhost:985"
        '    UrlStr = "http://192.168.0.32:981"

        WinHTTP = WebRequest.Create(UrlStr)

        WinHTTP.Method = "GET"

        XMLStr = "<Journal>"
        XMLStr = XMLStr & "<VchSeriesName>Main</VchSeriesName><Date>01-04-2023</Date><VchType>16</VchType>"
        XMLStr = XMLStr & "<AccEntries>"
        XMLStr = XMLStr & "<AccDetail><SrNo>1</SrNo><AccountName>Busy Infotech Pvt. Ltd.</AccountName><AmountType>2</AmountType><AmtMainCur>5000</AmtMainCur></AccDetail>"
        XMLStr = XMLStr & "<AccDetail><SrNo>2</SrNo><AccountName>Travelling Expenses</AccountName><AmountType>1</AmountType><AmtMainCur>2000</AmtMainCur></AccDetail>"
        XMLStr = XMLStr & "<AccDetail><SrNo>3</SrNo><AccountName>Advertisement &amp; Publicity</AccountName><AmountType>1</AmountType><AmtMainCur>2000</AmtMainCur></AccDetail>"
        XMLStr = XMLStr & "<AccDetail><SrNo>4</SrNo><AccountName>Books &amp; Periodicals</AccountName><AmountType>1</AmountType><AmtMainCur>1000</AmtMainCur></AccDetail>"
        XMLStr = XMLStr & "</AccEntries>"
        XMLStr = XMLStr & "</Journal>"


        Dim myWebHeaderCollection As New WebHeaderCollection

        myWebHeaderCollection.Add("SC", "2")    'Adds voucher through XML string
        myWebHeaderCollection.Add("VchType", "16")   'for Journal VchType=16
        myWebHeaderCollection.Add("VchXML", XMLStr)
        myWebHeaderCollection.Add("UserName", m_UseName)
        myWebHeaderCollection.Add("Pwd", m_Pwd)

        WinHTTP.Headers = myWebHeaderCollection

        res = WinHTTP.GetResponse

        ' Get the stream associated with the response. 
        reader = New StreamReader(res.GetResponseStream())

        sbSource = New StringBuilder(reader.ReadToEnd())

        ReturnedHTML = sbSource.ToString()

        QryResult = res.GetResponseHeader("Result")
        If QryResult = "T" Then
            Label1.Text = "Result - " & res.GetResponseHeader("Result")
            Label1.Text = Label1.Text & vbCrLf & "VchCode generated is - " & ReturnedHTML
        Else
            Label1.Text = "Result - " & res.GetResponseHeader("Result")
            Label1.Text = Label1.Text & vbCrLf & "Err Desc - " & res.GetResponseHeader("Description")
        End If

        WinHTTP = Nothing

    End Sub

    'Private Sub Button1_Click(sender As Object, e As EventArgs) Handles Button1.Click

    'End Sub

    'Private Sub Button2_Click(sender As Object, e As EventArgs) Handles Button2.Click

    'End Sub





    Private Sub AddPymt_Click(sender As Object, e As EventArgs) Handles AddPymt.Click

        Dim WinHTTP As HttpWebRequest
        Dim res As HttpWebResponse
        Dim UrlStr As String
        Dim XMLStr As String = ""
        Dim RetVal As String = ""
        Dim ReturnedHTML As String = ""
        Dim sbSource As StringBuilder
        Dim reader As StreamReader
        'Dim QryXML As String
        Dim QryResult As String



        UrlStr = "http://localhost:985"
        '    UrlStr = "http://192.168.0.32:981"

        WinHTTP = WebRequest.Create(UrlStr)

        WinHTTP.Method = "GET"


        XMLStr = XMLStr & "<Payment>"
        XMLStr = XMLStr & "<VchSeriesName>Main</VchSeriesName><Date>01-04-2023</Date><VchType>19</VchType><VchNo>1</VchNo>"

        XMLStr = XMLStr & "<AccEntries>"
        XMLStr = XMLStr & "<AccDetail><SrNo>1</SrNo><AccountName>Busy Infotech Pvt. Ltd.</AccountName><AmountType>1</AmountType><AmtMainCur>100</AmtMainCur></AccDetail>"
        XMLStr = XMLStr & "<AccDetail><SrNo>2</SrNo><AccountName>Cash</AccountName><AmountType>2</AmountType><AmtMainCur>100</AmtMainCur></AccDetail>"
        XMLStr = XMLStr & "</AccEntries>"

        XMLStr = XMLStr & "</Payment>"

        Dim myWebHeaderCollection As New WebHeaderCollection

        myWebHeaderCollection.Add("SC", "2")
        myWebHeaderCollection.Add("VchType", "19")   'for Payment VchType=9
        myWebHeaderCollection.Add("VchXML", XMLStr)
        myWebHeaderCollection.Add("UserName", m_UseName)
        myWebHeaderCollection.Add("Pwd", m_Pwd)

        WinHTTP.Headers = myWebHeaderCollection

        res = WinHTTP.GetResponse

        ' Get the stream associated with the response. 
        reader = New StreamReader(res.GetResponseStream())

        sbSource = New StringBuilder(reader.ReadToEnd())

        ReturnedHTML = sbSource.ToString()

        QryResult = res.GetResponseHeader("Result")
        If QryResult = "T" Then
            Label1.Text = "Result - " & res.GetResponseHeader("Result")
            Label1.Text = Label1.Text & vbCrLf & "VchCode generated is - " & ReturnedHTML
        Else
            Label1.Text = "Result - " & res.GetResponseHeader("Result")
            Label1.Text = Label1.Text & vbCrLf & "Err Desc - " & res.GetResponseHeader("Description")
        End If

        WinHTTP = Nothing
    End Sub

    Private Sub AddRcpt_Click(sender As Object, e As EventArgs) Handles AddRcpt.Click

        Dim WinHTTP As HttpWebRequest
        Dim res As HttpWebResponse
        Dim UrlStr As String
        Dim XMLStr As String = ""
        Dim RetVal As String = ""
        Dim ReturnedHTML As String = ""
        Dim sbSource As StringBuilder
        Dim reader As StreamReader
        'Dim QryXML As String
        Dim QryResult As String



        UrlStr = "http://localhost:985"
        '    UrlStr = "http://192.168.0.32:981"

        WinHTTP = WebRequest.Create(UrlStr)

        WinHTTP.Method = "GET"


        XMLStr = XMLStr & "<Receipt>"
        XMLStr = XMLStr & "<VchSeriesName>Main</VchSeriesName><Date>01-04-2023</Date><VchType>14</VchType><VchNo>1</VchNo>"

        XMLStr = XMLStr & "<AccEntries>"
        XMLStr = XMLStr & "<AccDetail><SrNo>1</SrNo><AccountName>Busy Infotech Pvt. Ltd.</AccountName><AmountType>2</AmountType><AmtMainCur>120</AmtMainCur></AccDetail>"
        XMLStr = XMLStr & "<AccDetail><SrNo>2</SrNo><AccountName>Cash</AccountName><AmountType>1</AmountType><AmtMainCur>120</AmtMainCur></AccDetail>"
        XMLStr = XMLStr & "</AccEntries>"

        XMLStr = XMLStr & "</Receipt>"

        Dim myWebHeaderCollection As New WebHeaderCollection

        myWebHeaderCollection.Add("SC", "2")
        myWebHeaderCollection.Add("VchType", "14")   'for Receipt VchType=14
        myWebHeaderCollection.Add("VchXML", XMLStr)
        myWebHeaderCollection.Add("UserName", m_UseName)
        myWebHeaderCollection.Add("Pwd", m_Pwd)

        WinHTTP.Headers = myWebHeaderCollection

        res = WinHTTP.GetResponse

        ' Get the stream associated with the response. 
        reader = New StreamReader(res.GetResponseStream())

        sbSource = New StringBuilder(reader.ReadToEnd())

        ReturnedHTML = sbSource.ToString()

        QryResult = res.GetResponseHeader("Result")
        If QryResult = "T" Then
            Label1.Text = "Result - " & res.GetResponseHeader("Result")
            Label1.Text = Label1.Text & vbCrLf & "VchCode generated is - " & ReturnedHTML
        Else
            Label1.Text = "Result - " & res.GetResponseHeader("Result")
            Label1.Text = Label1.Text & vbCrLf & "Err Desc - " & res.GetResponseHeader("Description")
        End If

        WinHTTP = Nothing
    End Sub

    Private Sub btnAddSO_Click(sender As Object, e As EventArgs) Handles btnAddSO.Click
        Dim WinHTTP As HttpWebRequest
        Dim res As HttpWebResponse
        Dim UrlStr As String
        Dim XMLStr As String
        Dim RetVal As String = ""
        Dim ReturnedHTML As String = ""
        Dim sbSource As StringBuilder
        Dim reader As StreamReader
        Dim QryXML As String
        Dim QryResult As String



        UrlStr = "http://localhost:985"
        '    UrlStr = "http://192.168.0.32:981"

        WinHTTP = WebRequest.Create(UrlStr)

        WinHTTP.Method = "GET"

        XMLStr = "<SaleOrder><VchSeriesName>Main</VchSeriesName><Date>01-04-2023</Date><VchType>12</VchType><StockUpdationDate>01-04-2023</StockUpdationDate><VchNo>SO-1</VchNo><STPTName>Local-ItemWise</STPTName><MasterName1>Party 02</MasterName1><MasterName2>Main Store</MasterName2>"
        XMLStr = XMLStr & "<ItemEntries>"
        XMLStr = XMLStr & "<ItemDetail><Date>01-04-2023</Date><VchType>12</VchType><VchNo>SO-1</VchNo><SrNo>1</SrNo><ItemName>Exempt</ItemName><UnitName>Pcs.</UnitName><AltUnitName>Pcs.</AltUnitName><ConFactor>1</ConFactor><Qty>1</Qty><QtyMainUnit>1</QtyMainUnit><QtyAltUnit>1</QtyAltUnit><Price>1500</Price><Amt>1500</Amt><Exempted>True</Exempted><MC>Main Store</MC></ItemDetail>"
        XMLStr = XMLStr & "<ItemDetail><Date>01-04-2023</Date><VchType>12</VchType><VchNo>SO-1</VchNo><SrNo>2</SrNo><ItemName>GST 12%</ItemName><UnitName>Pcs.</UnitName><AltUnitName>Pcs.</AltUnitName><ConFactor>1</ConFactor><Qty>1</Qty><QtyMainUnit>1</QtyMainUnit><QtyAltUnit>1</QtyAltUnit><Price>1000</Price><Amt>1120</Amt><STAmount>120</STAmount><STPercent>6</STPercent><TaxBeforeSurcharge1>60</TaxBeforeSurcharge1><STPercent1>6</STPercent1><TaxBeforeSurcharge>60</TaxBeforeSurcharge><MC>Main Store</MC></ItemDetail>"
        XMLStr = XMLStr & "<ItemDetail><Date>01-04-2023</Date><VchType>12</VchType><VchNo>SO-1</VchNo><SrNo>3</SrNo><ItemName>GST 18%</ItemName><UnitName>Pcs.</UnitName><AltUnitName>Pcs.</AltUnitName><ConFactor>1</ConFactor><Qty>1</Qty><QtyMainUnit>1</QtyMainUnit><QtyAltUnit>1</QtyAltUnit><Price>1245</Price><Amt>1469.1</Amt><STAmount>224.1</STAmount><STPercent>9</STPercent><TaxBeforeSurcharge1>112.05</TaxBeforeSurcharge1><STPercent1>9</STPercent1><TaxBeforeSurcharge>112.05</TaxBeforeSurcharge><MC>Main Store</MC></ItemDetail>"
        XMLStr = XMLStr & "</ItemEntries>"
        XMLStr = XMLStr & "<BillSundries><BSDetail><SrNo>1</SrNo><BSName>Discount</BSName><PercentVal>1</PercentVal><PercentOperatedOn>4089.1</PercentOperatedOn><Amt>40.89</Amt><Date>01-04-2023</Date><VchNo>SO-1</VchNo><VchType>12</VchType><tmpVchCode>40031</tmpVchCode></BSDetail></BillSundries>"
        XMLStr = XMLStr & "<PendingOrders><OrderDetail><MasterName1>Exempt</MasterName1><MasterName2>Party 02</MasterName2><OrderRefs><Method>1</Method><SrNo>1</SrNo><RefNo>SO-1</RefNo><Date>01-04-2023</Date><DueDate>01-04-2023</DueDate><Value1>1</Value1><Value2>1</Value2><MainTranPrice>1485</MainTranPrice><VchType>12</VchType><ItemSrNo>1</ItemSrNo><AltTranPrice>1485</AltTranPrice><MfgDate>01-04-2023</MfgDate><tmpRefCode>40000</tmpRefCode><tmpRecType>4</tmpRecType><tmpVchCode>40031</tmpVchCode><tmpMasterCode1>40292</tmpMasterCode1><tmpMasterCode2>40295</tmpMasterCode2></OrderRefs></OrderDetail><OrderDetail><MasterName1>GST 12%</MasterName1><MasterName2>Party 02</MasterName2><OrderRefs><Method>1</Method><SrNo>1</SrNo><RefNo>SO-1</RefNo><Date>01-04-2023</Date><DueDate>01-04-2023</DueDate><Value1>1</Value1><Value2>1</Value2><MainTranPrice>988.8</MainTranPrice><VchType>12</VchType><ItemSrNo>2</ItemSrNo><AltTranPrice>988.8</AltTranPrice><MfgDate>01-04-2023</MfgDate><tmpRefCode>40001</tmpRefCode><tmpRecType>4</tmpRecType><tmpVchCode>40031</tmpVchCode><tmpMasterCode1>40281</tmpMasterCode1><tmpMasterCode2>40295</tmpMasterCode2></OrderRefs></OrderDetail><OrderDetail><MasterName1>GST 18%</MasterName1><MasterName2>Party 02</MasterName2><OrderRefs><Method>1</Method><SrNo>1</SrNo><RefNo>SO-1</RefNo><Date>01-04-2023</Date><DueDate>01-04-2023</DueDate><Value1>1</Value1><Value2>1</Value2><MainTranPrice>1230.31</MainTranPrice><VchType>12</VchType><ItemSrNo>3</ItemSrNo><AltTranPrice>1230.31</AltTranPrice><MfgDate>01-04-2023</MfgDate><tmpRefCode>40002</tmpRefCode><tmpRecType>4</tmpRecType><tmpVchCode>40031</tmpVchCode><tmpMasterCode1>40294</tmpMasterCode1><tmpMasterCode2>40295</tmpMasterCode2></OrderRefs></OrderDetail></PendingOrders>"
        XMLStr = XMLStr & "</SaleOrder>"

        Dim myWebHeaderCollection As New WebHeaderCollection

        myWebHeaderCollection.Add("SC", "2")    'Add a voucher
        myWebHeaderCollection.Add("VchType", "12")   'for SALES_ORDER VchType=12
        myWebHeaderCollection.Add("VchXML", XMLStr)
        myWebHeaderCollection.Add("UserName", m_UseName)
        myWebHeaderCollection.Add("Pwd", m_Pwd)

        WinHTTP.Headers = myWebHeaderCollection

        res = WinHTTP.GetResponse

        ' Get the stream associated with the response. 
        reader = New StreamReader(res.GetResponseStream())

        sbSource = New StringBuilder(reader.ReadToEnd())

        ReturnedHTML = sbSource.ToString()

        QryResult = res.GetResponseHeader("Result")
        If QryResult = "T" Then
            Label1.Text = "Result - " & res.GetResponseHeader("Result")
            Label1.Text = Label1.Text & vbCrLf & "VchCode generated is - " & ReturnedHTML
        Else
            Label1.Text = "Result - " & res.GetResponseHeader("Result")
            Label1.Text = Label1.Text & vbCrLf & "Err Desc - " & res.GetResponseHeader("Description")
        End If

        WinHTTP = Nothing

    End Sub

    Private Sub btnGetVchXML_Click(sender As Object, e As EventArgs) Handles btnGetVchXML.Click
        Dim WinHTTP As HttpWebRequest
        Dim res As HttpWebResponse
        Dim UrlStr As String
        Dim Qry As String
        Dim RetVal As String = ""
        Dim ReturnedHTML As String = ""
        Dim sbSource As StringBuilder
        Dim reader As StreamReader
        Dim QryXML As String
        Dim QryResult As String



        UrlStr = "http://localhost:985"
        '    UrlStr = "http://192.168.0.32:981"

        WinHTTP = WebRequest.Create(UrlStr)

        WinHTTP.Method = "GET"

        ''Get All SALE Vchs 
        'Qry = "Select * from Tran1 where VchType=9"

        Dim myWebHeaderCollection As New WebHeaderCollection

        myWebHeaderCollection.Add("SC", "8")    'Get the Voucher XML of the specified VchCode
        myWebHeaderCollection.Add("VchCode", "40018")   'VchCode is unique BUSY Auto-generated field to identify a voucher
        myWebHeaderCollection.Add("UserName", m_UseName)
        myWebHeaderCollection.Add("Pwd", m_Pwd)

        WinHTTP.Headers = myWebHeaderCollection

        res = WinHTTP.GetResponse

        ' Get the stream associated with the response. 
        reader = New StreamReader(res.GetResponseStream())

        sbSource = New StringBuilder(reader.ReadToEnd())

        ReturnedHTML = sbSource.ToString()

        QryXML = ReturnedHTML

        QryResult = res.GetResponseHeader("Result")
        If QryResult = "T" Then
            Label1.Text = "Result - " & res.GetResponseHeader("Result")
            Label1.Text = Label1.Text & vbCrLf & "Data - " & res.GetResponseHeader("Content-Length")
        Else
            Label1.Text = "Result - " & res.GetResponseHeader("Result")
            Label1.Text = Label1.Text & vbCrLf & "Err Desc - " & res.GetResponseHeader("Description")
        End If

        WinHTTP = Nothing

    End Sub
End Class
